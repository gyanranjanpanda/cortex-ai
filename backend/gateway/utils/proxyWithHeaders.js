import proxy from "express-http-proxy";
import crypto from "crypto";

export const proxyWithUser =
(serviceUrl)=>{

 return proxy(
  serviceUrl,
  {
   // req.url is already stripped of the gateway mount prefix by Express
   proxyReqPathResolver: (req) => req.url,

   proxyReqOptDecorator:
   (proxyReqOpts, srcReq)=>{

    if(srcReq.user){

      proxyReqOpts.headers[
       "x-user-id"
      ] =
      srcReq.user.userId;

      proxyReqOpts.headers[
       "x-user-email"
      ] =
      srcReq.user.email;
      proxyReqOpts.headers[
       "x-user-avatar"
      ] =
      srcReq.user.avatar

      proxyReqOpts.headers["x-tenant-id"] = srcReq.user.tenantId || srcReq.user.orgId || "default";
      proxyReqOpts.headers["x-trace-id"] = srcReq.headers["x-trace-id"] || crypto.randomUUID();
      if (srcReq.headers["x-approval-id"]) {
        proxyReqOpts.headers["x-approval-id"] = srcReq.headers["x-approval-id"];
      }

    }

    return proxyReqOpts;

   }

  }
 );

}
