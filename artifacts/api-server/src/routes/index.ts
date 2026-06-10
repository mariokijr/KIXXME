import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import photosRouter from "./photos.js";
import conversationsRouter from "./conversations.js";
import messagesRouter from "./messages.js";
import profilesRouter from "./profiles.js";
import stripeRouter from "./stripe.js";
import supportRouter from "./support.js";
import notificationsRouter from "./notifications.js";
import liveRouter from "./live.js";
import accountRouter from "./account.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(photosRouter);
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(profilesRouter);
router.use(stripeRouter);
router.use(supportRouter);
router.use(notificationsRouter);
router.use(liveRouter);
router.use(accountRouter);

export default router;
