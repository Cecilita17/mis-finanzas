import { asVercel } from "../../server/vercel.js";
import { mercadoPago } from "../../server/mercadoPago.js";

export default asVercel(mercadoPago);
