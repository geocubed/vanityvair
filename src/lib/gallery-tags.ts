const pattern=()=>/(^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]{1,64})(?![\p{L}\p{N}_])/gu;
export const normalizeTag=(value:string)=>value.replace(/^#/,'').normalize('NFKC').toLocaleLowerCase('en-US');
export function hashtags(caption:string){return [...new Set([...caption.matchAll(pattern())].map(match=>normalizeTag(match[2])))];}
export function captionParts(caption:string){
 const parts:{text:string;tag?:string}[]=[];let cursor=0;
 for(const match of caption.matchAll(pattern())){const start=match.index!+match[1].length;if(start>cursor)parts.push({text:caption.slice(cursor,start)});parts.push({text:`#${match[2]}`,tag:normalizeTag(match[2])});cursor=start+match[2].length+1;}
 if(cursor<caption.length)parts.push({text:caption.slice(cursor)});return parts;
}
