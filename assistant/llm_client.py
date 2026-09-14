"""Unified LLM & Internet Intelligence Client for Desktop AI Voice Assistant.

Supports:
- Google Gemini (Gemini 1.5 Flash, Gemini 2.0, Gemini 1.5 Pro)
- OpenAI ChatGPT (GPT-4o Mini, GPT-4o, GPT-3.5 Turbo)
- Anthropic Claude (Claude 3.5 Haiku, Claude 3.5 Sonnet)
- Ollama (Local LLM)
- Internet Knowledge Engine (DuckDuckGo Instant Answers + Wikipedia REST)
"""

import json
import logging
import math
import re
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

from assistant.config.schema import AppConfig

logger = logging.getLogger("voice_assistant.llm")

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful, concise, and friendly Windows desktop voice assistant. "
    "Provide direct, conversational responses suitable for voice output. "
    "Keep your spoken answers brief (1-3 sentences) unless the user asks for details."
)


def evaluate_math_expression(query: str) -> Optional[str]:
    """Safely evaluates basic math questions like 'what is 25 * 4' or 'calculate 15% of 200'."""
    cleaned = query.lower().strip()
    # Strip prefixes
    for prefix in ["what is", "calculate", "solve", "how much is", "what's", "compute"]:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()
            break
    cleaned = cleaned.rstrip("?").strip()

    # Percentage: e.g. "15% of 200"
    pct_match = re.match(r"^([\d\.]+)\s*%\s*(?:of)\s*([\d\.]+)$", cleaned)
    if pct_match:
        try:
            pct = float(pct_match.group(1))
            total = float(pct_match.group(2))
            res = (pct / 100.0) * total
            return f"{pct}% of {total} is {res:g}."
        except Exception:
            pass

    # Basic arithmetic: only allow numbers, spaces, and + - * / ^ ( ) .
    sanitized = cleaned.replace("^", "**").replace("x", "*").replace("times", "*").replace("plus", "+").replace("minus", "-").replace("divided by", "/")
    if re.match(r"^[\d\s\+\-\*\/\(\)\.\%]+$", sanitized) and any(op in sanitized for op in "+-*/"):
        try:
            # Safe eval with restricted builtins
            allowed_names = {"math": math}
            result = eval(sanitized, {"__builtins__": {}}, allowed_names)
            if isinstance(result, (int, float)):
                return f"{query.strip().rstrip('?')} is {result:g}."
        except Exception:
            pass
    return None


def query_duckduckgo(query: str, timeout: int = 6) -> Optional[str]:
    """Queries DuckDuckGo Instant Answer API."""
    try:
        url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_html=1&skip_disambig=1"
        req = urllib.request.Request(url, headers={"User-Agent": "DesktopVoiceAssistant/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            answer = data.get("Answer")
            if answer:
                return answer
            abstract = data.get("AbstractText")
            if abstract:
                # Trim to 2-3 sentences max
                sentences = re.split(r"(?<=[.!?]) +", abstract)
                return " ".join(sentences[:3])
    except Exception as e:
        logger.debug(f"DuckDuckGo search error: {e}")
    return None


def query_wikipedia(query: str, timeout: int = 6) -> Optional[str]:
    """Searches Wikipedia and fetches the summary extract."""
    try:
        # 1. Search for most relevant title
        clean_q = re.sub(r"^(who is|who was|what is|what are|tell me about|where is|when was)\s+", "", query, flags=re.IGNORECASE).strip(" ?")
        search_q = clean_q or query.strip(" ?")
        
        search_url = (
            f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(search_q)}"
            "&format=json&utf8=1&srlimit=3"
        )
        req = urllib.request.Request(search_url, headers={"User-Agent": "DesktopVoiceAssistant/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            sdata = json.loads(resp.read().decode("utf-8"))
            results = sdata.get("query", {}).get("search", [])
            if not results:
                return None
            title = results[0]["title"]

        # Check if the page has an incumbent officeholder (e.g. Prime Minister, President, etc.)
        incumbent_str = None
        try:
            parse_url = (
                f"https://en.wikipedia.org/w/api.php?action=parse&page={urllib.parse.quote(title)}"
                "&prop=wikitext&section=0&format=json"
            )
            req_parse = urllib.request.Request(parse_url, headers={"User-Agent": "DesktopVoiceAssistant/1.0"})
            with urllib.request.urlopen(req_parse, timeout=3) as presp:
                p_json = json.loads(presp.read().decode("utf-8"))
                wt = p_json.get("parse", {}).get("wikitext", {}).get("*", "")
                inc_match = re.search(r"\|\s*incumbent\s*=\s*\[\[([^\]\|]+)", wt, re.IGNORECASE)
                since_match = re.search(r"\|\s*incumbent_since\s*=\s*([^\n\|\}]+)", wt, re.IGNORECASE)
                if inc_match:
                    person = inc_match.group(1).strip()
                    since_text = f" since {since_match.group(1).strip()}" if since_match else ""
                    incumbent_str = f"The current {title} is {person}{since_text}."
        except Exception:
            pass

        # 2. Fetch page summary for the title
        summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title)}"
        req_sum = urllib.request.Request(summary_url, headers={"User-Agent": "DesktopVoiceAssistant/1.0"})
        with urllib.request.urlopen(req_sum, timeout=timeout) as resp:
            pdata = json.loads(resp.read().decode("utf-8"))
            extract = pdata.get("extract")
            if extract:
                sentences = re.split(r"(?<=[.!?]) +", extract)
                if incumbent_str:
                    return f"{incumbent_str} {' '.join(sentences[:2])}"
                return " ".join(sentences[:3])
            elif incumbent_str:
                return incumbent_str
    except Exception as e:
        logger.debug(f"Wikipedia search error: {e}")
    return None


def get_office_holder(query: str, timeout: int = 4) -> Optional[str]:
    """Extracts current incumbent officeholder (e.g. Prime Minister, President, Chancellor) from Wikipedia."""
    clean = re.sub(r"^(who is|who was|who's)\s+(the\s+)?", "", query, flags=re.IGNORECASE).strip(" ?")
    if not clean:
        return None
    s_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(clean)}&format=json&utf8=1&srlimit=1"
    req = urllib.request.Request(s_url, headers={"User-Agent": "DesktopVoiceAssistant/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
            items = data.get("query", {}).get("search", [])
            if not items:
                return None
            title = items[0]["title"]
            p_url = f"https://en.wikipedia.org/w/api.php?action=parse&page={urllib.parse.quote(title)}&prop=wikitext&section=0&format=json"
            preq = urllib.request.Request(p_url, headers={"User-Agent": "DesktopVoiceAssistant/1.0"})
            with urllib.request.urlopen(preq, timeout=timeout) as pr:
                pdata = json.loads(pr.read().decode("utf-8"))
                wt = pdata.get("parse", {}).get("wikitext", {}).get("*", "")
                inc = re.search(r"\|\s*incumbent\s*=\s*\[\[([^\]\|]+)", wt, re.IGNORECASE)
                since = re.search(r"\|\s*incumbent_since\s*=\s*([^\n\|\}]+)", wt, re.IGNORECASE)
                if inc:
                    person = inc.group(1).strip()
                    since_raw = since.group(1).strip() if since else ""
                    since_cleaned = re.sub(r"\{\{[^\}]*\}\}", "", since_raw).strip()
                    s_str = f" since {since_cleaned}" if since_cleaned else ""
                    return f"The current {title} is {person}{s_str}."
    except Exception as e:
        logger.debug(f"Officeholder lookup error: {e}")
    return None


def query_internet_knowledge(query: str, timeout: int = 6) -> Optional[str]:
    """Combines DuckDuckGo and Wikipedia to answer factual queries instantly."""
    # 1. Check math / calculations
    math_ans = evaluate_math_expression(query)
    if math_ans:
        return math_ans

    # 2. Check if asking about an officeholder / leader
    if re.search(r"\b(who is|who was|who's)\b", query, re.IGNORECASE):
        leader = get_office_holder(query, timeout=4)
        if leader:
            return leader

    # 3. Try DuckDuckGo
    ddg_ans = query_duckduckgo(query, timeout=timeout)
    if ddg_ans and len(ddg_ans.strip()) > 15:
        return ddg_ans

    # 4. Try Wikipedia search
    wiki_ans = query_wikipedia(query, timeout=timeout)
    if wiki_ans and len(wiki_ans.strip()) > 15:
        return wiki_ans

    return None


def call_gemini(
    prompt: str,
    api_key: str,
    model: str = "gemini-1.5-flash",
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    base_url: str = "https://generativelanguage.googleapis.com/v1beta",
    timeout: int = 15,
) -> str:
    """Calls the Google Gemini REST API."""
    url = f"{base_url.rstrip('/')}/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 300,
        },
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "").strip()
        raise ValueError("Empty or malformed response from Gemini API")


def call_openai(
    prompt: str,
    api_key: str,
    model: str = "gpt-4o-mini",
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    base_url: str = "https://api.openai.com/v1",
    timeout: int = 15,
) -> str:
    """Calls the OpenAI or compatible chat completions API."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 300,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "").strip()
        raise ValueError("Empty or malformed response from OpenAI API")


def call_claude(
    prompt: str,
    api_key: str,
    model: str = "claude-3-5-haiku-20241022",
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    base_url: str = "https://api.anthropic.com/v1",
    timeout: int = 15,
) -> str:
    """Calls the Anthropic Claude Messages API."""
    url = f"{base_url.rstrip('/')}/messages"
    payload = {
        "model": model,
        "system": system_prompt,
        "max_tokens": 300,
        "messages": [
            {"role": "user", "content": prompt},
        ],
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        contents = data.get("content", [])
        if contents:
            return contents[0].get("text", "").strip()
        raise ValueError("Empty or malformed response from Claude API")


def call_ollama(
    prompt: str,
    model: str = "llama3.2",
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    base_url: str = "http://localhost:11434",
    timeout: int = 15,
) -> str:
    """Calls a local Ollama API."""
    url = f"{base_url.rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("message", {}).get("content", "").strip()


def call_openrouter(
    prompt: str,
    api_key: str,
    model: str = "google/gemini-2.0-flash-exp:free",
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    base_url: str = "https://openrouter.ai/api/v1",
    timeout: int = 20,
) -> str:
    """Calls OpenRouter API for free and paid models."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 300,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Desktop Voice Assistant",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "").strip()
        raise ValueError("Empty or malformed response from OpenRouter API")


def query_assistant_intelligence(
    prompt: str,
    config: AppConfig,
) -> Tuple[str, str]:
    """Dispatches a user query to the active AI reasoning provider or internet knowledge.

    Returns:
        (response_text, provider_used)
    """
    provider = (config.llm.provider or "internet").lower().strip()
    system_prompt = config.conversation.system_prompt or DEFAULT_SYSTEM_PROMPT

    # 1. Google Gemini (Supports latest gemini-2.0-flash, gemini-1.5-flash)
    if provider in ["gemini", "google"]:
        gemini_cfg = config.llm.gemini
        api_key = gemini_cfg.api_key
        if api_key and api_key.strip():
            try:
                ans = call_gemini(
                    prompt,
                    api_key=api_key.strip(),
                    model=gemini_cfg.model or "gemini-2.0-flash",
                    system_prompt=system_prompt,
                    base_url=gemini_cfg.base_url,
                    timeout=gemini_cfg.timeout,
                )
                return ans, f"gemini ({gemini_cfg.model})"
            except Exception as e:
                logger.warning(f"Gemini API call failed: {e}")
                if not config.llm.fallback_to_internet:
                    return f"Google Gemini error: {e}", "gemini_error"
        else:
            logger.info("Gemini provider selected but no api_key configured. Falling back to internet.")

    # 2. OpenRouter (Supports free models: google/gemini-2.0-flash-exp:free, deepseek/deepseek-r1:free, etc.)
    elif provider in ["openrouter"]:
        or_cfg = config.llm.openrouter
        api_key = or_cfg.api_key
        if api_key and api_key.strip():
            try:
                ans = call_openrouter(
                    prompt,
                    api_key=api_key.strip(),
                    model=or_cfg.model or "google/gemini-2.0-flash-exp:free",
                    system_prompt=system_prompt,
                    base_url=or_cfg.base_url,
                    timeout=or_cfg.timeout,
                )
                return ans, f"openrouter ({or_cfg.model})"
            except Exception as e:
                logger.warning(f"OpenRouter call failed: {e}")
                if not config.llm.fallback_to_internet:
                    return f"OpenRouter error: {e}", "openrouter_error"
        else:
            logger.info("OpenRouter provider selected but no api_key configured. Falling back to internet.")

    # 3. OpenAI / ChatGPT (Supports gpt-4o-mini, gpt-4o, o3-mini)
    elif provider in ["openai", "chatgpt"]:
        openai_cfg = config.llm.openai
        api_key = openai_cfg.api_key
        if api_key and api_key.strip():
            try:
                ans = call_openai(
                    prompt,
                    api_key=api_key.strip(),
                    model=openai_cfg.model or "gpt-4o-mini",
                    system_prompt=system_prompt,
                    base_url=openai_cfg.base_url,
                    timeout=openai_cfg.timeout,
                )
                return ans, f"openai ({openai_cfg.model})"
            except Exception as e:
                logger.warning(f"OpenAI API call failed: {e}")
                if not config.llm.fallback_to_internet:
                    return f"OpenAI error: {e}", "openai_error"
        else:
            logger.info("OpenAI provider selected but no api_key configured. Falling back to internet.")

    # 4. Anthropic Claude (Supports claude-3-7-sonnet, claude-3-5-haiku)
    elif provider in ["claude", "anthropic"]:
        claude_cfg = config.llm.claude
        api_key = claude_cfg.api_key
        if api_key and api_key.strip():
            try:
                ans = call_claude(
                    prompt,
                    api_key=api_key.strip(),
                    model=claude_cfg.model or "claude-3-5-haiku-20241022",
                    system_prompt=system_prompt,
                    base_url=claude_cfg.base_url,
                    timeout=claude_cfg.timeout,
                )
                return ans, f"claude ({claude_cfg.model})"
            except Exception as e:
                logger.warning(f"Claude API call failed: {e}")
                if not config.llm.fallback_to_internet:
                    return f"Claude error: {e}", "claude_error"
        else:
            logger.info("Claude provider selected but no api_key configured. Falling back to internet.")

    # 5. Ollama
    elif provider == "ollama":
        ollama_cfg = config.llm.ollama
        try:
            ans = call_ollama(
                prompt,
                model=ollama_cfg.model,
                system_prompt=system_prompt,
                base_url=ollama_cfg.base_url,
                timeout=ollama_cfg.timeout,
            )
            return ans, f"ollama ({ollama_cfg.model})"
        except Exception as e:
            logger.warning(f"Ollama call failed: {e}")
            if not config.llm.fallback_to_internet:
                return f"Ollama connection error: {e}. Ensure Ollama is running at {ollama_cfg.base_url}", "ollama_error"

    # 5. Internet Knowledge Search (Default & High-Accuracy Free Fallback)
    if config.llm.fallback_to_internet or provider == "internet":
        try:
            k_ans = query_internet_knowledge(prompt, timeout=8)
            if k_ans:
                return k_ans, "internet_knowledge"
        except Exception as e:
            logger.warning(f"Internet knowledge search failed: {e}")

    # 6. Final Rule-based fallback if offline or no knowledge found
    return (
        f"I received your request: '{prompt}'. "
        f"I am operating in {provider} mode. Ready to assist with desktop automation or voice commands."
    ), "rule_based"
