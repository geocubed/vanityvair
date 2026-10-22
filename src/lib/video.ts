export function videoEmbed(value:string):string {
  try {
    const url=new URL(value);if(url.protocol!=='https:')return '';
    const host=url.hostname.replace(/^www\./,'');
    const youtubeId=host==='youtu.be'?url.pathname.slice(1):['youtube.com','youtube-nocookie.com'].includes(host)?(url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})$/)?.[1]||''):'';
    if(/^[\w-]{11}$/.test(youtubeId))return `https://www.youtube-nocookie.com/embed/${youtubeId}`;
    if(['vimeo.com','player.vimeo.com'].includes(host)) {
      const id=url.pathname.match(/^\/(?:video\/)?(\d{5,15})$/)?.[1];if(id)return `https://player.vimeo.com/video/${id}`;
    }
  } catch {}
  return '';
}
