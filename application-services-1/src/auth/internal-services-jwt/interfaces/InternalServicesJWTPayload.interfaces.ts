export interface InternalServicesJWTPayload {
  allowedParentRoutes: string[];
  requestedService: string;
  requestId: string;
  exp: number;
  iat: number;
}
