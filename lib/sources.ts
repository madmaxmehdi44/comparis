export const SOURCES = [
  { id:'torob', name:'ترب', buildUrl:(q:string)=>`https://torob.com/search/?query=${encodeURIComponent(q)}` },
  { id:'digikala', name:'دیجی‌کالا', buildUrl:(q:string)=>`https://www.digikala.com/search/?q=${encodeURIComponent(q)}` },
  { id:'emalls', name:'ایمالز', buildUrl:(q:string)=>`https://emalls.ir/Search.aspx?Search=${encodeURIComponent(q)}` },
] as const;

export function normalizeDigits(input:string){
  return input.replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[,،]/g,'');
}

export function parsePrice(text:string):number|undefined{
  const n=normalizeDigits(text).match(/\d[\d\s.]*/)?.[0]?.replace(/[\s.]/g,'');
  if(!n) return undefined;
  const value=Number(n);
  if(!Number.isFinite(value)) return undefined;
  return value > 100000 ? Math.round(value/10) : value;
}