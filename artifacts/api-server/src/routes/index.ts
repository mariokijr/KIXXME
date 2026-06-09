import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import photosRouter from "./photos.js";
import conversationsRouter from "./conversations.js";
import messagesRouter from "./messages.js";
import profilesRouter from "./profiles.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(photosRouter);
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(profilesRouter);

export default router;
