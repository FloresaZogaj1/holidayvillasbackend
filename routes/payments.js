// backend/routes/payments.js
import { Router } from "express";
const r = Router();

const FRONT_OK  = process.env.FRONT_OK  || "https://holidayvillasks.com/#/payment/success";
const FRONT_FAIL= process.env.FRONT_FAIL|| "https://holidayvillasks.com/#/payment/fail";

r.get("/ok", (req, res) => {
  const oid = req.query?.oid || req.query?.OrderId || "";
  const target = `${FRONT_OK}${FRONT_OK.includes("?") ? "&" : "?"}oid=${encodeURIComponent(oid)}`;
  return res.redirect(302, target);
});

r.get("/fail", (req, res) => {
  const oid = req.query?.oid || req.query?.OrderId || "";
  const msg = req.query?.msg || req.query?.ErrMsg || req.query?.Response || "Payment failed";
  const target =
    `${FRONT_FAIL}${FRONT_FAIL.includes("?") ? "&" : "?"}` +
    `oid=${encodeURIComponent(oid)}&msg=${encodeURIComponent(msg)}`;
  return res.redirect(302, target);
});

export default r;
