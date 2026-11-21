import { Router, type IRouter } from "express";
import authRouter from "./auth";
import chatRouter from "./chat";
import conversationsRouter from "./conversations";
import prReviewsRouter from "./pr-reviews";
import activityRouter from "./activity";
import dnaRouter from "./dna";
import billingRouter from "./billing";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(conversationsRouter);
router.use(prReviewsRouter);
router.use(activityRouter);
router.use(dnaRouter);
router.use(chatRouter);
router.use(billingRouter);

export default router;
