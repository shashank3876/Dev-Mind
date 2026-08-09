import { Router, type IRouter } from "express";
import authRouter from "./auth";
import chatRouter from "./chat";
import billingRouter from "./billing";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(chatRouter);
router.use(billingRouter);

export default router;
