import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../app-config/admin-key.guard';
import { MetadataService } from './metadata.service';

@Controller('v1/admin/metadata')
@UseGuards(AdminKeyGuard)
export class MetadataController {
  constructor(private readonly metadata:MetadataService) {}
  @Get(':provider/search') search(@Param('provider') provider:string,@Query('q') q:string,@Query('limit',new ParseIntPipe({optional:true})) limit?:number){ return this.metadata.search(provider,q,limit); }
  @Post(':provider/import/:id') import(@Param('provider') provider:string,@Param('id') id:string){ return this.metadata.import(provider,id); }
}
