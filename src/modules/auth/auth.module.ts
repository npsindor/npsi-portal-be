import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { authLimiter, otpLimiter } from "../../common/rate-limit/limiters.js";
import { AuthController } from "./auth.controller.js";
import { AUTH_ROUTES as R } from "./auth.routes.js";
import { AuthService } from "./auth.service.js";
import { UsersRepository } from "./users.repository.js";

const route = (path: string, method: RequestMethod) => ({ path: `${R.base}/${path}`, method });

@Module({ controllers: [AuthController], providers: [AuthService, UsersRepository], exports: [UsersRepository] })
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(authLimiter)
      .forRoutes(
        route(R.register, RequestMethod.POST),
        route(R.login, RequestMethod.POST),
        route(R.resetRequest, RequestMethod.POST),
        route(R.resetPassword, RequestMethod.POST),
        route(R.changePassword, RequestMethod.POST),
      );
    consumer.apply(otpLimiter).forRoutes(route(R.verifyOtp, RequestMethod.POST), route(R.resendOtp, RequestMethod.POST));
  }
}
