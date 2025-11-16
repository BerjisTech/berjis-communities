const API_BASE = 'https://communities-api.berjis.tech';

const contentEl = document.getElementById('content');
const titleEl = document.getElementById('title');
const statusEl = document.getElementById('status');
const postBtn = document.getElementById('postBtn');
const loginBtn = document.getElementById('loginBtn');

let currentContext = {
  url: '',
  site: '',
  title: '',
  body: '',
  media: []
};

function setStatus(msg, kind = '') {
  statusEl.textContent = msg || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function inferMediaKind(url) {
  const lower = (url || '').toLowerCase();
  if (lower.match(/\.(mp4|webm|mov)(\?|#|$)/)) return 'video';
  return 'image';
}

async function extractContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return { url: '', site: '', title: '', body: '', media: [] };
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selection = (window.getSelection()?.toString() || '').trim();
        const url = location.href;
        const host = location.hostname.toLowerCase();
        const site = host;
        const docTitle = document.title || '';
        const ctx = { url, site, title: '', body: '', media: [] };

        if (selection) {
          ctx.body = selection;
        }

        // Reddit post page
        if (!ctx.body && host.includes('reddit.com')) {
          const isComments = location.pathname.includes('/comments/');
          if (isComments) {
            const postRoot =
              document.querySelector('[data-test-id="post-container"]') ||
              document.querySelector('[data-test-id="post-content"]') ||
              document.querySelector('shreddit-post') ||
              document.querySelector('main');
            if (postRoot) {
              const titleEl =
                postRoot.querySelector('h1') ||
                postRoot.querySelector('h2') ||
                document.querySelector('h1');
              const bodyEl =
                postRoot.querySelector('div[data-click-id="text"]') ||
                postRoot.querySelector('div[data-testid="post-container"]');
              ctx.title = titleEl ? titleEl.textContent.trim() : docTitle;
              ctx.body = bodyEl ? bodyEl.textContent.trim() : '';
              const mediaEls = postRoot.querySelectorAll('img, video, video source');
              const urls = new Set();
              mediaEls.forEach((el) => {
                const tag = el.tagName.toLowerCase();
                let src = el.getAttribute('src') || '';
                const srcset = el.getAttribute('srcset') || '';
                if (!src && srcset) {
                  src = srcset.split(' ')[0];
                }
                if (!src) return;
                if (!/^https?:\/\//.test(src)) {
                  try {
                    src = new URL(src, location.href).toString();
                  } catch {
                    return;
                  }
                }
                if (urls.has(src)) return;
                urls.add(src);
                ctx.media.push({ url: src, tag });
              });
            }
          }
        }

        // Twitter / X
        if (!ctx.body && (host.includes('twitter.com') || host.includes('x.com'))) {
          const mainTweet =
            document.querySelector('article[data-testid="tweet"]') ||
            document.querySelector('article[tabindex="-1"]');
          if (mainTweet) {
            const textEl = mainTweet.querySelector('div[data-testid="tweetText"]');
            ctx.body = textEl ? textEl.textContent.trim() : mainTweet.innerText.trim();
            ctx.title = docTitle;
            const mediaEls = mainTweet.querySelectorAll('img, video, video source');
            const urls = new Set();
            mediaEls.forEach((el) => {
              const tag = el.tagName.toLowerCase();
              let src = el.getAttribute('src') || '';
              if (!src) return;
              if (!/^https?:\/\//.test(src)) {
                try {
                  src = new URL(src, location.href).toString();
                } catch {
                  return;
                }
              }
              if (urls.has(src)) return;
              urls.add(src);
              ctx.media.push({ url: src, tag });
            });
          }
        }

        // LinkedIn (best-effort)
        if (!ctx.body && host.includes('linkedin.com')) {
          const post =
            document.querySelector('div.feed-shared-update-v2') ||
            document.querySelector('article') ||
            document.querySelector('main');
          if (post) {
            ctx.body = post.innerText.trim();
            ctx.title = docTitle;
            const mediaEls = post.querySelectorAll('img, video, video source');
            const urls = new Set();
            mediaEls.forEach((el) => {
              const tag = el.tagName.toLowerCase();
              let src = el.getAttribute('src') || '';
              if (!src) return;
              if (!/^https?:\/\//.test(src)) {
                try {
                  src = new URL(src, location.href).toString();
                } catch {
                  return;
                }
              }
              if (urls.has(src)) return;
              urls.add(src);
              ctx.media.push({ url: src, tag });
            });
          }
        }

        if (!ctx.title) {
          ctx.title = docTitle;
        }
        if (!ctx.body && selection) {
          ctx.body = selection;
        }
        return ctx;
      }
    });
    return result?.result || { url: '', site: '', title: '', body: '', media: [] };
  } catch {
    return { url: '', site: '', title: '', body: '', media: [] };
  }
}

async function init() {
  setStatus('Loading content…');
  currentContext = await extractContext();

  const pieces = [];
  if (currentContext.title && currentContext.body && currentContext.site.includes('reddit.com')) {
    pieces.push(currentContext.title);
    pieces.push('');
    pieces.push(currentContext.body);
  } else if (currentContext.body) {
    pieces.push(currentContext.body);
  }
  if (currentContext.url) {
    pieces.push('\n\n— Shared from ' + currentContext.url);
  }
  contentEl.value = pieces.join('\n');
  setStatus('');
}

async function postToBerjis() {
  const body = contentEl.value.trim();
  const customTitle = titleEl.value.trim();

  if (!body) {
    setStatus('Content cannot be empty.', 'error');
    return;
  }

  setStatus('Posting…');
  postBtn.disabled = true;

  try {
    const media =
      (currentContext.media || []).map((m) => ({
        url: m.url,
        kind: inferMediaKind(m.url)
      })) || [];

    const resp = await fetch(API_BASE + '/v1/posts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: customTitle || (currentContext.title || undefined),
        body,
        kind: 'post',
        visibility: 'public',
        media
      })
    });

    if (resp.status === 401) {
      setStatus('Not signed in. Click "Open Communities" to log in.', 'error');
      return;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      setStatus('Post failed (' + resp.status + '). ' + text.slice(0, 120), 'error');
      return;
    }

    setStatus('Posted to Berjis Communities.', 'ok');
  } catch (err) {
    setStatus('Network error: ' + err, 'error');
  } finally {
    postBtn.disabled = false;
  }
}

postBtn.addEventListener('click', () => {
  postToBerjis();
});

loginBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://communities.berjis.tech' });
});

init();
