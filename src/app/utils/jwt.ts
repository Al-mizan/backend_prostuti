import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

export const createToken = (
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: string | number = "7d",
  issuer: string = "prostuti"
): string => {
  const options: SignOptions = {
    expiresIn: expiresIn as SignOptions["expiresIn"],
    issuer,
  };
  return jwt.sign(payload, secret, options);
};

export const verifyToken = (token: string, secret: string): JwtPayload => {
  return jwt.verify(token, secret) as JwtPayload;
};
