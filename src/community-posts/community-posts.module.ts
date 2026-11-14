import { Module } from "@nestjs/common";
import { CommunityPostsController } from "./community-posts.controller.js";
import { CommunityPostsRepository } from "./community-posts.repository.js";
import { CommunityPostsService } from "./community-posts.service.js";

@Module({ controllers: [CommunityPostsController], providers: [CommunityPostsService, CommunityPostsRepository] })
export class CommunityPostsModule {}
