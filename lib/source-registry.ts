export interface SourceDefinition {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  strategy: 'http';
}

export const SOURCES: SourceDefinition[] = [
  { id: 'torob', name: 'ترب', baseUrl: 'https://torob.com', enabled: true, strategy: 'http' },
  { id: 'digikala', name: 'دیجی‌کالا', baseUrl: 'https://www.digikala.com', enabled: true, strategy: 'http' },
  { id: 'emalls', name: 'ایمالز', baseUrl: 'https://emalls.ir', enabled: true, strategy: 'http' },
];

export function getSource(id: string): SourceDefinition | undefined {
  return SOURCES.find((source) => source.id === id && source.enabled);
}
