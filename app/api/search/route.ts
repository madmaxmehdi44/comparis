import { NextRequest, NextResponse } from 'next/server';
import { SOURCES } from '@/lib/sources';
import { crawlSource } from '@/lib/crawler';

export const dynamic='force-dynamic';
export const maxDuration=10;

export async function GET(req:NextRequest){
  const query=req.nextUrl.searchParams.get('q')?.trim();
  if(!query) return NextResponse.json({error:'q is required'},{status:400});
  if(query.length>120) return NextResponse.json({error:'query too long'},{status:400});
  const sources=await Promise.all(SOURCES.map(s=>crawlSource(s,query)));
  const results=sources.flatMap(s=>s.offers).sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));
  return NextResponse.json({query,results,sources,completedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}