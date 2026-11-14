import { Module } from "@nestjs/common";
import { HomeHighlightsController } from "./home-highlights.controller.js";
import { HomeHighlightsRepository } from "./home-highlights.repository.js";
import { HomeHighlightsService } from "./home-highlights.service.js";

@Module({ controllers: [HomeHighlightsController], providers: [HomeHighlightsService, HomeHighlightsRepository] })
export class HomeHighlightsModule {}
