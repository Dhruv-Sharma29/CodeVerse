import { oracleMiddleware } from '../server/oracle.mjs';
export const config = { maxDuration: 90 };
export default function handler(req, res) {
  return oracleMiddleware(req,res,()=>{res.statusCode=404;res.end();});
}
