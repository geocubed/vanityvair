export function mountCarousel(root:HTMLElement,onOpen?:(index:number)=>void,start=0,keyTarget?:HTMLElement){
 const track=root.querySelector<HTMLElement>('.carousel-track')!;
 const slides=[...root.querySelectorAll<HTMLButtonElement>('.carousel-slide')];
 const dots=[...root.querySelectorAll<HTMLButtonElement>('[data-slide]')];
 let index=start;let frame=0;
 function update(){dots.forEach((dot,i)=>{if(i===index)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});const count=root.querySelector('.carousel-count');if(count)count.textContent=`${index+1} / ${slides.length}`;const credit=root.querySelector('.moment-credit');if(credit)credit.textContent=slides[index]?.dataset.credit||'';}
 function go(value:number){index=Math.max(0,Math.min(slides.length-1,value));track.scrollTo({left:index*track.clientWidth,behavior:'instant'});update();}
 dots.forEach((dot,i)=>dot.addEventListener('click',()=>go(i)));
 const keyboardTarget=keyTarget||track;
 const onKey=(event:KeyboardEvent)=>{if(!event.altKey&&!event.ctrlKey&&!event.metaKey&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){event.preventDefault();go(index+(event.key==='ArrowRight'?1:-1));}};
 keyboardTarget.addEventListener('keydown',onKey);
 track.addEventListener('scroll',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{index=Math.max(0,Math.min(slides.length-1,Math.round(track.scrollLeft/Math.max(1,track.clientWidth))));update();});},{passive:true});
 slides.forEach((slide,i)=>slide.addEventListener('click',()=>onOpen?.(i)));
 // Preserve the selected slide when responsive layout changes its width.
 const observer=new ResizeObserver(()=>go(index));observer.observe(track);
 go(start);
 return ()=>{observer.disconnect();cancelAnimationFrame(frame);keyboardTarget.removeEventListener('keydown',onKey);};
}
