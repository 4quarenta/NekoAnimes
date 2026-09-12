import { Injectable } from '@nestjs/common';
import { ServerAdapter } from './contracts/server-adapter';
import { AnimesDigitalAdapter } from './adapters/animesdigital/animesdigital.adapter';
import { AnimesOnlineCcAdapter } from './adapters/animesonlinecc/animesonlinecc.adapter';
import { GoyabuAdapter } from './adapters/goyabu/goyabu.adapter';

@Injectable()
export class ServerRegistry {
  private readonly adapters: Map<string, ServerAdapter>;

  constructor(
    goyabu: GoyabuAdapter,
    animesOnlineCc: AnimesOnlineCcAdapter,
    animesDigital: AnimesDigitalAdapter
  ) {
    this.adapters = new Map<string, ServerAdapter>([
      [goyabu.descriptor.id, goyabu],
      [animesOnlineCc.descriptor.id, animesOnlineCc],
      [animesDigital.descriptor.id, animesDigital]
    ]);
  }

  list(): ServerAdapter[] {
    return [...this.adapters.values()];
  }

  get(id: string): ServerAdapter | null {
    return this.adapters.get(id) ?? null;
  }
}
