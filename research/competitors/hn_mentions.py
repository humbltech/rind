#!/usr/bin/env python3
"""HN mentions via Algolia API. No auth needed."""
import requests
from datetime import datetime

def search_hn(query, max_results=20):
    params = {
        "query": query,
        "tags": "story",
        "hitsPerPage": max_results,
    }
    r = requests.get("https://hn.algolia.com/api/v1/search", params=params)
    if r.status_code != 200:
        return []
    hits = r.json().get("hits", [])
    results = []
    for h in hits:
        results.append({
            "title": h.get("title", ""),
            "url": f"https://news.ycombinator.com/item?id={h.get('objectID')}",
            "points": h.get("points", 0),
            "comments": h.get("num_comments", 0),
            "date": h.get("created_at", "")[:10],
            "author": h.get("author", ""),
        })
    return sorted(results, key=lambda x: x["points"], reverse=True)

queries = [
    ("LangSmith", "langsmith"),
    ("LiteLLM", "litellm"),
    ("MCP Security", "mcp security agent"),
    ("MCP Scan / Snyk", "mcp-scan OR snyk mcp"),
    ("AI Agent Security", "ai agent security"),
    ("MCP Protocol", "model context protocol mcp"),
]

output_path = "/Users/atinderpalsingh/projects/rind-bundle/rind/research/competitors/hn-mentions.md"
with open(output_path, "w") as f:
    f.write(f"# HN Mentions — Competitor & Market Research\n**Pulled**: {datetime.now().strftime('%Y-%m-%d')}\n\n")
    for label, query in queries:
        print(f"Searching HN: {query}...")
        results = search_hn(query, max_results=10)
        f.write(f"## {label}\n_Query: `{query}`_\n\n")
        if not results:
            f.write("_No results found._\n\n")
            continue
        f.write("| Title | Points | Comments | Date |\n")
        f.write("|-------|--------|----------|------|\n")
        for r in results[:8]:
            title_link = f"[{r['title'][:80]}]({r['url']})"
            f.write(f"| {title_link} | {r['points']} | {r['comments']} | {r['date']} |\n")
        f.write("\n")

print(f"✓ Saved: {output_path}")
