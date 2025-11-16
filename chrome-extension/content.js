const BERJIS_API_BASE = 'https://communities-api.berjis.tech';

function inferMediaKind(url) {
  const lower = (url || '').toLowerCase();
  if (lower.match(/\.(mp4|webm|mov)(\?|#|$)/)) return 'video';
  return 'image';
}

function isBlobUrl(src) {
  return (src || '').startsWith('blob:');
}

function isEmojiImage(el, src) {
  const alt = (el.getAttribute('alt') || '').trim();
  if (alt && alt.length <= 3) {
    return true;
  }
  const cls = (el.className || '').toString().toLowerCase();
  if (cls.includes('emoji') || cls.includes('twemoji')) {
    return true;
  }
  const lower = (src || '').toLowerCase();
  if (lower.includes('emoji') || lower.includes('twemoji') || lower.includes('abs.twimg.com/emoji')) {
    return true;
  }
  return false;
}

function ensureShareButton(container, onClick) {
  if (!container || container.dataset.berjisHasButton === '1') return;
  container.dataset.berjisHasButton = '1';

  const btn = document.createElement('button');
  btn.textContent = 'Post to Berjis';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '11px';
  btn.style.padding = '2px 6px';
  btn.style.borderRadius = '999px';
  btn.style.border = '1px solid rgba(59,130,246,0.6)';
  btn.style.background = 'rgba(37,99,235,0.06)';
  btn.style.color = '#1d4ed8';
  btn.style.marginTop = '4px';
  btn.style.float = 'right';
  btn.style.clear = 'both';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onClick().catch(console.error);
  });

  const wrapper = document.createElement('div');
  wrapper.style.marginTop = '4px';
  wrapper.appendChild(btn);
  container.appendChild(wrapper);
}

function showToast(message, kind = 'ok') {
  try {
    const doc = document;
    if (!doc || !doc.body) return;
    let container = doc.getElementById('berjis-toast-container');
    if (!container) {
      container = doc.createElement('div');
      container.id = 'berjis-toast-container';
      container.style.position = 'fixed';
      container.style.zIndex = '2147483647';
      container.style.bottom = '16px';
      container.style.right = '16px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      container.style.pointerEvents = 'none';
      doc.body.appendChild(container);
    }
    const toast = doc.createElement('div');
    toast.textContent = message;
    toast.style.pointerEvents = 'auto';
    toast.style.maxWidth = '280px';
    toast.style.padding = '8px 12px';
    toast.style.borderRadius = '999px';
    toast.style.fontSize = '12px';
    toast.style.boxShadow = '0 8px 16px rgba(15,23,42,0.35)';
    toast.style.color = kind === 'error' ? '#fee2e2' : '#ecfdf5';
    toast.style.background =
      kind === 'error'
        ? 'linear-gradient(135deg, rgba(248,113,113,0.95), rgba(153,27,27,0.98))'
        : 'linear-gradient(135deg, rgba(45,212,191,0.95), rgba(5,150,105,0.98))';
    toast.style.border = '1px solid rgba(15,23,42,0.4)';
    toast.style.backdropFilter = 'blur(10px)';
    toast.style.webkitBackdropFilter = 'blur(10px)';
    toast.style.transition = 'opacity 0.25s ease-out, transform 0.25s ease-out';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(4px)';
      setTimeout(() => {
        if (toast.parentNode === container) {
          container.removeChild(toast);
        }
      }, 250);
    }, kind === 'error' ? 4500 : 2800);
  } catch {
    // swallow toast errors
  }
}

async function postToBerjis(payload) {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'berjisPost',
      payload
    });
    if (!resp) {
      showToast('Berjis: post failed (no response).', 'error');
      return;
    }
    if (resp.error) {
      showToast('Berjis: network error: ' + resp.error, 'error');
      return;
    }
    if (resp.status === 401) {
      showToast('Berjis: not signed in. Open communities.berjis.tech and sign in, then try again.', 'error');
      return;
    }
    if (!resp.ok) {
      const text = resp.body || '';
      showToast('Berjis: post failed (' + resp.status + '). ' + text.slice(0, 160), 'error');
      return;
    }
    showToast('Posted to Berjis Communities.', 'ok');
  } catch (err) {
    showToast('Berjis: network error: ' + err, 'error');
  }
}

function fullUrl(relative) {
  if (!relative) return '';
  try {
    return new URL(relative, location.href).toString();
  } catch {
    return relative;
  }
}

// Twitter / X
function enhanceTwitter() {
  const host = location.hostname.toLowerCase();
  if (!host.includes('twitter.com') && !host.includes('x.com')) return;

  const scan = () => {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach((article) => {
      const footer = article.querySelector('div[role="group"]') || article;
      ensureShareButton(footer, async () => {
        const textEl = article.querySelector('div[data-testid="tweetText"]');
        let body = '';
        if (textEl) {
          const clone = textEl.cloneNode(true);
          clone.querySelectorAll('img').forEach((img) => {
            const alt = img.getAttribute('alt') || '';
            const textNode = document.createTextNode(alt);
            img.replaceWith(textNode);
          });
          body = clone.innerText.trim();
        } else {
          body = article.innerText.trim();
        }
        if (!body) {
          body = document.title || 'Shared from Twitter';
        }
        const linkEl = article.querySelector('a[href*="/status/"][role="link"]');
        const url = linkEl ? fullUrl(linkEl.getAttribute('href')) : location.href;
        if (url) {
          body += '\n\n— Shared from ' + url;
        }
        const mediaEls = article.querySelectorAll(
          'div[data-testid="tweetPhoto"] img, div[data-testid="videoPlayer"] video, div[data-testid="videoPlayer"] source'
        );
        const urls = new Set();
        const media = [];
        mediaEls.forEach((el) => {
          const tag = el.tagName.toLowerCase();
          let src = el.getAttribute('src') || '';
          if (!src) return;
          if (isBlobUrl(src)) return;
          if (tag === 'img' && isEmojiImage(el, src)) return;
          const avatarAncestor = el.closest('div[data-testid="User-Avatar"]');
          if (avatarAncestor) return;
          src = fullUrl(src);
          if (urls.has(src)) return;
          urls.add(src);
          media.push({ url: src, kind: inferMediaKind(src) });
        });
        await postToBerjis({ title: '', body, media });
      });
    });
  };

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
}

// Reddit
function enhanceReddit() {
  const host = location.hostname.toLowerCase();
  if (!host.includes('reddit.com')) return;

  const scan = () => {
    const posts = document.querySelectorAll('[data-test-id="post-container"], shreddit-post, article');
    posts.forEach((post) => {
      // Try to find a footer/actions area; fallback to post root
      const footer =
        post.querySelector('div[data-testid="post-container"] footer') ||
        post.querySelector('div[data-test-id="post-content"]') ||
        post;
      ensureShareButton(footer, async () => {
        const rootPost = post.closest('shreddit-post') || post;
        const titleEl =
          post.querySelector('h1') ||
          post.querySelector('h2') ||
          post.querySelector('h3') ||
          document.querySelector('h1');
        const bodyEl =
          post.querySelector('div[data-click-id="text"]') ||
          post.querySelector('div[data-testid="post-container"]');
        const title = titleEl ? titleEl.textContent.trim() : document.title || '';
        let body = bodyEl ? bodyEl.textContent.trim() : '';
        const urlEl =
          post.querySelector('a[data-click-id="comments"]') ||
          post.querySelector('a[data-testid="post-title"]') ||
          null;
        const url = urlEl ? fullUrl(urlEl.getAttribute('href')) : location.href;
        if (!body) {
          body = title;
        }
        if (url) {
          body += '\n\n— Shared from ' + url;
        }
        const externalHref = rootPost && rootPost.getAttribute('content-href');
        if (externalHref) {
          body += '\nSource: ' + externalHref;
        }
        const mediaRoot =
          rootPost.querySelector('[slot="post-media-container"]') ||
          rootPost.querySelector('[slot="thumbnail"]') ||
          post.querySelector('[data-click-id="media"]');
        const mediaEls = mediaRoot ? mediaRoot.querySelectorAll('img, video, video source') : [];
        const urls = new Set();
        const media = [];
        mediaEls.forEach((el) => {
          const tag = el.tagName.toLowerCase();
          let src = el.getAttribute('src') || '';
          const srcset = el.getAttribute('srcset') || '';
          if (!src && srcset) {
            src = srcset.split(' ')[0];
          }
          if (!src) return;
          if (isBlobUrl(src)) return;
          if (tag === 'img' && isEmojiImage(el, src)) return;
          const cls = (el.className || '').toString().toLowerCase();
          const avatarAncestor = el.closest('.avatar');
          if (avatarAncestor || cls.includes('avatar') || cls.includes('shreddit-subreddit-icon__icon')) {
            return;
          }
          src = fullUrl(src);
          if (urls.has(src)) return;
          urls.add(src);
          media.push({ url: src, kind: inferMediaKind(src) });
        });
        await postToBerjis({ title, body, media });
      });
    });
  };

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
}

// LinkedIn (best-effort)
function enhanceLinkedIn() {
  const host = location.hostname.toLowerCase();
  if (!host.includes('linkedin.com')) return;

  const scan = () => {
    const posts =
      document.querySelectorAll('div.feed-shared-update-v2') ||
      document.querySelectorAll('article');
    posts.forEach((post) => {
      const footer = post.querySelector('footer') || post;
      ensureShareButton(footer, async () => {
        let body = post.innerText.trim();
        const title = document.title || '';
        const url = location.href;
        if (url) {
          body += '\n\n— Shared from ' + url;
        }
        const mediaEls = post.querySelectorAll('img, video, video source');
        const urls = new Set();
        const media = [];
        mediaEls.forEach((el) => {
          const tag = el.tagName.toLowerCase();
          let src = el.getAttribute('src') || '';
          if (!src) return;
          if (isBlobUrl(src)) return;
          if (tag === 'img' && isEmojiImage(el, src)) return;
          src = fullUrl(src);
          if (urls.has(src)) return;
          urls.add(src);
          media.push({ url: src, kind: inferMediaKind(src) });
        });
        await postToBerjis({ title, body, media });
      });
    });
  };

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
}

// Facebook (best-effort)
function enhanceFacebook() {
  const host = location.hostname.toLowerCase();
  if (!host.includes('facebook.com')) return;

  const scan = () => {
    const posts = document.querySelectorAll('div[role="article"]');
    posts.forEach((post) => {
      // Try to find the main post action bar, not per-comment toolbars
      let footer = null;
      const groups = post.querySelectorAll('div[role="group"]');
      for (const g of groups) {
        const text = (g.innerText || '').toLowerCase();
        // Heuristic: action bar usually contains Like/Comment/Share
        if (text.includes('like') || text.includes('comment') || text.includes('share')) {
          footer = g;
          break;
        }
      }
      if (!footer) {
        footer =
          post.querySelector('[aria-label][role="group"]') ||
          post;
      }
      ensureShareButton(footer, async () => {
        let body = '';
        const story = post.querySelector('div[dir="auto"] span');
        if (story) {
          const clone = story.closest('div[dir="auto"]')?.cloneNode(true) || story.cloneNode(true);
          clone.querySelectorAll('img').forEach((img) => {
            const alt = img.getAttribute('alt') || '';
            const textNode = document.createTextNode(alt);
            img.replaceWith(textNode);
          });
          body = clone.innerText.trim();
        } else {
          body = post.innerText.trim();
        }
        if (!body) {
          body = document.title || 'Shared from Facebook';
        }
        const url = location.href;
        if (url) {
          body += '\n\n— Shared from ' + url;
        }
        const mediaEls = post.querySelectorAll('img, video, video source');
        const urls = new Set();
        const media = [];
        mediaEls.forEach((el) => {
          const tag = el.tagName.toLowerCase();
          let src = el.getAttribute('src') || '';
          if (!src) return;
          if (isBlobUrl(src)) return;
          if (tag === 'img' && isEmojiImage(el, src)) return;
          const cls = (el.className || '').toString().toLowerCase();
          if (cls.includes('avatar') || cls.includes('profile') || cls.includes('reaction')) {
            return;
          }
          src = fullUrl(src);
          if (urls.has(src)) return;
          urls.add(src);
          media.push({ url: src, kind: inferMediaKind(src) });
        });
        await postToBerjis({ title: '', body, media });
      });
    });
  };

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
}

enhanceTwitter();
enhanceReddit();
enhanceLinkedIn();
enhanceFacebook();
