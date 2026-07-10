r"""Koishi market probe examples.

Windows PowerShell, Chrome default path:

    python .\test\01_market_probe.py `
      --browser-path "C:\Program Files\Google\Chrome\Application\chrome.exe" `
      --query "找一个 AI 绘图插件" `
      --top-k 8

Linux Bash, Chrome default path:

    python test/01_market_probe.py \
      --browser-path /usr/bin/google-chrome \
      --query "找一个 AI 绘图插件" \
      --top-k 8

Local search only:

    python .\test\01_market_probe.py --query "找一个 AI 绘图插件" --top-k 8

OpenAI-compatible dry run:

    python .\test\01_market_probe.py `
      --query "找一个 AI 绘图插件" `
      --top-k 8 `
      --llm-provider openai `
      --base-url "https://api.openai.com/v1" `
      --model "gpt-4.1-mini" `
      --dry-run-prompt

Anthropic dry run:

    python .\test\01_market_probe.py `
      --query "找一个 AI 绘图插件" `
      --top-k 8 `
      --llm-provider anthropic `
      --model "claude-sonnet-4-20250514" `
      --dry-run-prompt
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


MARKET_URL = "https://koishi.chat/zh-CN/market/"
REGISTRY_URL = "https://registry.koishi.chat/index.json"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0 Safari/537.36"
)


def fetch_text(url: str, timeout: int) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/json,text/javascript,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, "replace")


def fetch_json(url: str, timeout: int) -> object:
    return json.loads(fetch_text(url, timeout))


def load_json_file(path: Path) -> object:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def discover_local_registry() -> Path | None:
    seen: set[Path] = set()
    bases = [Path.cwd().resolve(), *Path(__file__).resolve().parents]
    for base in bases:
        if base in seen:
            continue
        seen.add(base)
        candidate = base / "AAA_from_git_AAA" / "koishijs-registry" / "index.json"
        if candidate.is_file():
            return candidate
    return None


def load_registry(args: argparse.Namespace) -> tuple[str, dict]:
    if args.registry_json:
        data = load_json_file(args.registry_json)
        return str(args.registry_json), ensure_registry(data)

    if not args.fetch_remote:
        local = discover_local_registry()
        if local:
            data = load_json_file(local)
            return str(local), ensure_registry(data)

    data = fetch_json(REGISTRY_URL, args.timeout)
    return REGISTRY_URL, ensure_registry(data)


def ensure_registry(data: object) -> dict:
    if not isinstance(data, dict) or not isinstance(data.get("objects"), list):
        raise ValueError("registry data must be an object with an objects array")
    return data


def launch_browser(args: argparse.Namespace) -> None:
    browser = Path(args.browser_path).expanduser()
    if not browser.is_file():
        raise FileNotFoundError(f"browser executable not found: {browser}")

    command = [str(browser), *args.browser_arg, args.url]
    subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
    )
    print(f"[browser] launched: {browser}")
    print(f"[browser] url: {args.url}")


def probe_market_page(url: str, timeout: int) -> None:
    print(f"[page] probing: {url}")
    try:
        page = fetch_text(url, timeout)
    except Exception as exc:
        print(f"[page] failed: {exc}")
        return

    title = extract_title(page)
    if title:
        print(f"[page] title: {title}")

    js_assets = collect_js_assets(page, url)
    print(f"[page] js assets: {len(js_assets)}")
    print(f"[page] has loading placeholder: {contains_any(page, ['正在加载插件市场', 'loading'])}")

    registry_urls: set[str] = set()
    layout_markers: list[str] = []
    interesting_assets = [
        asset for asset in js_assets if "market" in asset or "/theme." in asset or "/chunks/theme." in asset
    ]

    for asset in interesting_assets[:8]:
        try:
            text = fetch_text(asset, timeout)
        except Exception as exc:
            print(f"[page] asset failed: {asset} ({exc})")
            continue

        registry_urls.update(re.findall(r"https://[^\"'`]+index\.json", text))
        if '"layout":"market"' in text or "layout:\"market\"" in text:
            layout_markers.append(asset)
        if "registry.koishi.chat/index.json" in text:
            registry_urls.add(REGISTRY_URL)

    for registry_url in sorted(registry_urls):
        print(f"[page] registry source: {registry_url}")
    for marker in layout_markers:
        print(f"[page] market layout marker: {marker}")


def collect_js_assets(page: str, base_url: str) -> list[str]:
    assets: list[str] = []
    for match in re.finditer(r"""(?:src|href)=["']([^"']+\.js)["']""", page):
        assets.append(urllib.parse.urljoin(base_url, html_lib.unescape(match.group(1))))
    return list(dict.fromkeys(assets))


def extract_title(page: str) -> str | None:
    match = re.search(r"<title>(.*?)</title>", page, re.I | re.S)
    if not match:
        return None
    return html_lib.unescape(re.sub(r"\s+", " ", match.group(1)).strip())


def contains_any(text: str, needles: list[str]) -> bool:
    lowered = text.lower()
    return any(needle.lower() in lowered for needle in needles)


def pick_description(item: dict) -> str:
    package = item.get("package") or {}
    manifest = item.get("manifest") or {}
    desc = manifest.get("description") or package.get("description") or ""

    if isinstance(desc, dict):
        for key in ("zh-CN", "zh", "en"):
            value = desc.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return " ".join(str(value).strip() for value in desc.values() if str(value).strip())

    return str(desc).strip()


def plugin_summary(item: dict) -> dict:
    package = item.get("package") or {}
    links = package.get("links") or {}
    score = item.get("score") or {}
    downloads = item.get("downloads") or {}
    return {
        "name": package.get("name") or "",
        "shortname": item.get("shortname") or "",
        "version": package.get("version") or "",
        "category": item.get("category") or "",
        "verified": bool(item.get("verified")),
        "portable": bool(item.get("portable")),
        "downloadsLastMonth": downloads.get("lastMonth") or 0,
        "rating": item.get("rating") or 0,
        "scoreFinal": score.get("final") or 0,
        "updatedAt": item.get("updatedAt") or package.get("date") or "",
        "description": pick_description(item),
        "keywords": package.get("keywords") or [],
        "npm": links.get("npm") or "",
        "homepage": links.get("homepage") or "",
        "repository": links.get("repository") or "",
    }


def split_query(query: str) -> list[str]:
    tokens = re.findall(r"[@a-z0-9_.+\-/]+|[\u4e00-\u9fff]+", query.lower())
    if query.strip() and query.lower().strip() not in tokens:
        tokens.append(query.lower().strip())
    return list(dict.fromkeys(tokens))


def contains_query(text: str, token: str) -> bool:
    if not token:
        return False
    if re.search(r"[\u4e00-\u9fff]", token):
        return token in text

    bare = token.strip("@")
    if len(bare) <= 2 and re.fullmatch(r"[a-z0-9]+", bare):
        return bare in re.split(r"[^a-z0-9]+", text)

    return token in text


def search_plugins(objects: list[dict], query: str, limit: int) -> list[tuple[float, dict]]:
    tokens = split_query(query)
    query_lower = query.lower().strip()
    ranked: list[tuple[float, dict]] = []

    for item in objects:
        summary = plugin_summary(item)
        name = summary["name"].lower()
        shortname = summary["shortname"].lower()
        category = summary["category"].lower()
        description = summary["description"].lower()
        keywords = [str(keyword).lower() for keyword in summary["keywords"]]
        keyword_text = " ".join(keywords)
        searchable = " ".join([name, shortname, category, description, keyword_text])

        score = 0.0
        if query_lower:
            if query_lower == name or query_lower == shortname:
                score += 20
            elif contains_query(name, query_lower) or contains_query(shortname, query_lower):
                score += 8
            elif contains_query(description, query_lower):
                score += 4
            elif contains_query(keyword_text, query_lower):
                score += 3

        for token in tokens:
            if token == name or token == shortname:
                score += 12
            elif contains_query(name, token) or contains_query(shortname, token):
                score += 5
            elif contains_query(category, token):
                score += 2.5
            elif contains_query(description, token):
                score += 2
            elif contains_query(keyword_text, token):
                score += 1.5
            elif contains_query(searchable, token):
                score += 1

        score += math.log1p(float(summary["downloadsLastMonth"])) / 10
        score += float(summary["scoreFinal"]) / 3
        score += min(float(summary["rating"]), 10.0) / 50
        if summary["verified"]:
            score += 0.3

        ranked.append((score, summary))

    ranked.sort(key=lambda pair: pair[0], reverse=True)
    return ranked[:limit]


def print_results(results: list[tuple[float, dict]]) -> None:
    print("[search] top candidates:")
    for index, (score, item) in enumerate(results, 1):
        badges = []
        if item["category"]:
            badges.append(f"cat={item['category']}")
        if item["verified"]:
            badges.append("verified")
        badges.append(f"dl30d={item['downloadsLastMonth']}")
        print(f"{index:02d}. {item['name']}@{item['version']} score={score:.2f} {' '.join(badges)}")
        if item["description"]:
            print(f"    {item['description'][:180]}")
        if item["npm"]:
            print(f"    {item['npm']}")


def build_llm_prompt(query: str, results: list[tuple[float, dict]]) -> str:
    candidates = [item for _, item in results]
    return (
        "You help users find Koishi plugins. "
        "Rank the candidates for the user request, explain practical reasons, "
        "and mention package names exactly. Respond in Chinese.\n\n"
        f"User request: {query}\n\n"
        "Candidates JSON:\n"
        f"{json.dumps(candidates, ensure_ascii=False, indent=2)}"
    )


def call_openai(args: argparse.Namespace, prompt: str, api_key: str) -> str:
    base_url = (args.base_url or "https://api.openai.com/v1").rstrip("/")
    payload = {
        "model": args.model,
        "temperature": args.temperature,
        "messages": [
            {"role": "system", "content": "You are a precise Koishi plugin search assistant."},
            {"role": "user", "content": prompt},
        ],
    }
    data = post_json(
        base_url + "/chat/completions",
        payload,
        {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        args.timeout,
    )
    return data["choices"][0]["message"]["content"]


def call_anthropic(args: argparse.Namespace, prompt: str, api_key: str) -> str:
    base_url = (args.base_url or "https://api.anthropic.com").rstrip("/")
    payload = {
        "model": args.model,
        "max_tokens": args.max_tokens,
        "temperature": args.temperature,
        "system": "You are a precise Koishi plugin search assistant.",
        "messages": [{"role": "user", "content": prompt}],
    }
    data = post_json(
        base_url + "/v1/messages",
        payload,
        {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        args.timeout,
    )
    return "".join(part.get("text", "") for part in data.get("content", []) if part.get("type") == "text")


def post_json(url: str, payload: dict, headers: dict[str, str], timeout: int) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"{url} failed with HTTP {exc.code}: {error_body[:1000]}") from exc


def resolve_api_key(args: argparse.Namespace) -> str | None:
    if args.api_key:
        return args.api_key
    env_name = args.api_key_env
    if not env_name:
        env_name = "OPENAI_API_KEY" if args.llm_provider == "openai" else "ANTHROPIC_API_KEY"
    return os.environ.get(env_name)


def maybe_call_llm(args: argparse.Namespace, query: str, results: list[tuple[float, dict]]) -> None:
    if args.llm_provider == "none":
        return
    if not args.model:
        raise SystemExit("--model is required when --llm-provider is not none")

    prompt = build_llm_prompt(query, results)
    if args.dry_run_prompt:
        print("[llm] prompt:")
        print(prompt)
        return

    api_key = resolve_api_key(args)
    if not api_key:
        raise SystemExit("--api-key or provider env var is required for LLM calls")

    if args.llm_provider == "openai":
        content = call_openai(args, prompt, api_key)
    elif args.llm_provider == "anthropic":
        content = call_anthropic(args, prompt, api_key)
    else:
        raise ValueError(f"unsupported provider: {args.llm_provider}")

    print("[llm] answer:")
    print(content.strip())


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Probe Koishi market data and optional LLM ranking.")
    parser.add_argument("--url", default=MARKET_URL, help="Market page URL to open/probe.")
    parser.add_argument("--browser-path", help="Browser executable path. Nothing is hardcoded.")
    parser.add_argument(
        "--browser-arg",
        action="append",
        default=[],
        help="Extra browser argument passed before the URL. Repeat for multiple args.",
    )
    parser.add_argument("--registry-json", type=Path, help="Local Koishi registry index.json.")
    parser.add_argument("--fetch-remote", action="store_true", help="Fetch registry from registry.koishi.chat.")
    parser.add_argument("--skip-page-probe", action="store_true", help="Skip probing market page assets.")
    parser.add_argument("--query", default="ai", help="Search query or natural-language need.")
    parser.add_argument("--top-k", type=int, default=12, help="Candidate count to print/pass to LLM.")
    parser.add_argument("--timeout", type=int, default=30, help="Network timeout in seconds.")
    parser.add_argument("--llm-provider", choices=["none", "openai", "anthropic"], default="none")
    parser.add_argument("--base-url", help="Provider base URL. OpenAI base should usually include /v1.")
    parser.add_argument("--model", help="Model name for LLM calls.")
    parser.add_argument("--api-key", help="API key. Prefer env vars for normal use.")
    parser.add_argument("--api-key-env", help="Environment variable name for the API key.")
    parser.add_argument("--dry-run-prompt", action="store_true", help="Print the LLM prompt without calling API.")
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--max-tokens", type=int, default=1200)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    if args.browser_path:
        launch_browser(args)

    if not args.skip_page_probe:
        probe_market_page(args.url, args.timeout)

    source, registry = load_registry(args)
    objects = registry["objects"]
    print(f"[registry] source: {source}")
    print(f"[registry] version={registry.get('version')} total={registry.get('total')} objects={len(objects)}")

    results = search_plugins(objects, args.query, args.top_k)
    print(f"[search] query: {args.query!r}")
    print_results(results)
    maybe_call_llm(args, args.query, results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
