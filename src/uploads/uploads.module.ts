import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { uploadDailyLimiter, uploadLimiter } from "../common/rate-limit/limiters.js";
import { UploadFileInterceptor } from "./upload-file.interceptor.js";
import { UploadsController } from "./uploads.controller.js";
import { UPLOAD_ROUTE } from "./uploads.routes.js";
import { UploadsService } from "./uploads.service.js";

@Module({ controllers: [UploadsController], providers: [UploadsService, UploadFileInterceptor] })
export class UploadsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(uploadLimiter, uploadDailyLimiter).forRoutes({ path: UPLOAD_ROUTE, method: RequestMethod.POST });
  }
}
