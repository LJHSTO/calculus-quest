let loading;

export async function createHighlighter(options) {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(`highlighter.js?v=${__CQ_HIGHLIGHTER_VERSION__}`, document.baseURI).href;
      script.onload = () => resolve(window.__cqCreateHighlighter);
      script.onerror = () => {
        script.remove();
        loading = null;
        reject(new Error("代码高亮资源加载失败"));
      };
      document.head.append(script);
    });
  }
  const create = await loading;
  return create(options);
}
