import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { GtmRouter } from "./gtm.router";
import { GtmService } from "./gtm.service";

@Module({ imports: [TrpcModule], providers: [GtmService, GtmRouter] })
export class GtmModule {}
