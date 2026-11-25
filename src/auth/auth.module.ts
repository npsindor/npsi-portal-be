import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { authLimiter, otpLimiter } from "../common/rate-limit/limiters.js";
import { AuthController } from "./auth.controller.js";
import { AUTH_ROUTES as R } from "./auth.routes.js";
import { AuthService } from "./auth.service.js";
import { MobileOtpService } from "./mobile-otp.service.js";
import { OtpChallengesRepository } from "./otp-challenges.repository.js";
import { UsersRepository } from "./users.repository.js";

const route = (path: string, method: RequestMethod) => ({ path: `${R.base}/${path}`, method });

@Module({
  controllers: [AuthController],
  providers: [AuthService, UsersRepository, MobileOtpService, OtpChallengesRepository],
  exports: [UsersRepository, AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(authLimiter)
      .forRoutes(
        route(R.register, RequestMethod.POST),
        route(R.mobileRegister, RequestMethod.POST),
        route(R.login, RequestMethod.POST),
        route(R.resetRequest, RequestMethod.POST),
        route(R.resetPassword, RequestMethod.POST),
        route(R.changePassword, RequestMethod.PUT),
        route(R.emailChange, RequestMethod.POST),
      );
    consumer
      .apply(otpLimiter)
      .forRoutes(
        route(R.verifyOtp, RequestMethod.POST),
        route(R.resendOtp, RequestMethod.POST),
        route(R.mobileOtp, RequestMethod.POST),
        route(R.mobileOtpVerify, RequestMethod.POST),
        route(R.emailChangeConfirm, RequestMethod.POST),
      );
  }
}
