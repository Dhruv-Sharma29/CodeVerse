import { oracleMiddleware } from '../../server/oracle.mjs';
export default function handler(req, res) {
  return oracleMiddleware(req,res,()=>{res.statusCode=404;res.end();});
}
