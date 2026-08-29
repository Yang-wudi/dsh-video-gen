# Security Policy

Report vulnerabilities privately to the repository owner through GitHub Security Advisories. Do not open a public issue containing credentials or sensitive response bodies.

The plugin stores provider API keys (Aliyun DashScope, Volcengine Ark, OpenAI, Google Gemini) through DSH's write-only `credentials` service. The browser can check whether a key exists but cannot read back the stored plaintext.

Generated videos are saved under the session workspace and served back through the plugin HTTP route: the fast path streams from the in-memory cache; the durable fallback (`POST { attachment }`) only reads video files proven by the co-located marker index (`.dsh-video-gen-index.json`), rejects non-video extensions and separator-carrying names, and enforces realpath containment inside the marker's own directory.
