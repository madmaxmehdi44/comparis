import * as cheerio from 'cheerio';
import { Offer, SourceResult } from './types';
import { SOURCES, parsePrice } from './sources';

const UA='ComparisBot/0.1 (+https://github.com/madmaxmehdi44/comparis)';

function jsonLdOffers(html:string, source:typeof SOURCES[number], url:string):Offer[]{
  const $=cheerio.load(html); const out:Offer[]=[];
  $('script[type="application/ld+json"]').each((_,el)=>{
    try{
      const raw=JSON.parse($(el).text()); const nodes=Array.isArray(raw)?raw:[raw];
      for(const x of nodes){
        const products=x?.['@type']==='Product'?[x]:[];
        for(const p of products){
          const offer=Array.isArray(p.offers)?p.offers[0]:p.offers;
          const price=offer?.price!=null?Number(String(offer.price).replace(/,/g,'')):undefined;
          if(p.name && Number.isFinite(price)) out.push({sourceId:source.id,source:source.name,url,title:String(p.name),price,currency:'IRT',availability:String(offer.availability||'unknown'),observedAt:new Date().toISOString(),status:'fresh',method:'http',confidence:.98});
        }
      }
    }catch{}
  }); return out.slice(0,20);
}

function heuristicOffers(html:string, source:typeof SOURCES[number], url:string):Offer[]{
  const $=cheerio.load(html); const out:Offer[]=[];
  $('a').each((_,a)=>{
    if(out.length>=20)return; const title=$(a).text().replace(/\s+/g,' ').trim(); const price=parsePrice(title);
    if(title.length>10 && price && price>1000) out.push({sourceId:source.id,source:source.name,url,title,price,currency:'IRT',observedAt:new Date().toISOString(),status:'fresh',method:'http',confidence:.65});
  }); return out;
}

export async function crawlSource(source:typeof SOURCES[number],query:string):Promise<SourceResult>{
  const started=Date.now(); const url=source.buildUrl(query);
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),7000);
  try{
    const res=await fetch(url,{signal:controller.signal,headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml'},cache:'no-store',redirect:'follow'});
    clearTimeout(timer);
    if(!res.ok) return {id:source.id,name:source.name,status:res.status===403||res.status===429?'blocked':'failed',method:'http',offers:[],latencyMs:Date.now()-started,error:`HTTP ${res.status}`};
    const html=await res.text(); let offers=jsonLdOffers(html,source,url); if(!offers.length) offers=heuristicOffers(html,source,url);
    return {id:source.id,name:source.name,status:'fresh',method:'http',offers,latencyMs:Date.now()-started};
  }catch(e){clearTimeout(timer); return {id:source.id,name:source.name,status:'failed',method:'http',offers:[],latencyMs:Date.now()-started,error:e instanceof Error?e.message:'fetch failed'};}
}