import passport from "passport";
import {
  Strategy as JwtStrategy,
  ExtractJwt,
  StrategyOptions,
} from "passport-jwt";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Request } from "express";
import { envVars } from "../config/env";
import { prisma } from "./prisma";

const cookieExtractor = (req: Request) => {
  let token = null;
  if (req && req.cookies) {
    token = req.cookies["accessToken"];
  }
  return token;
};

const jwtOptions: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromExtractors([
    ExtractJwt.fromAuthHeaderAsBearerToken(),
    cookieExtractor,
  ]),
  secretOrKey: envVars.JWT_SECRET,
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      const userId = payload.sub || payload.userId;
      if (!userId) {
        return done(null, false);
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.isDeleted) {
        return done(null, false);
      }
      return done(null, {
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      return done(error, false);
    }
  })
);

if (envVars.GOOGLE_CLIENT_ID && envVars.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: envVars.GOOGLE_CLIENT_ID,
        clientSecret: envVars.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/v1/auth/google/callback",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.trim().toLowerCase();
          const googleId = profile.id;
          const name = profile.displayName || email?.split("@")[0] || "User";

          if (!email) {
            return done(new Error("No email found in Google profile"), false);
          }

          let user = await prisma.user.findFirst({
            where: {
              OR: [{ googleId }, { email }],
            },
          });

          if (user) {
            if (!user.googleId) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: { googleId },
              });
            }
          } else {
            user = await prisma.user.create({
              data: {
                name,
                email,
                googleId,
                role: "STUDENT",
                avatarId: "mascot_1",
              },
            });
          }

          return done(null, {
            userId: user.id,
            email: user.email,
            role: user.role,
          });
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );
}

export default passport;
