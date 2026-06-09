import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import photosRouter from "./photos.js";
import conversationsRouter from "./conversations.js";
import profilesRouter from "./profiles.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(photosRouter);
router.use(conversationsRouter);
router.use(profilesRouter);

if (process.env.NODE_ENV !== "production") {
  import("./dev.js").then(({ default: devRouter }) => {
    router.use(devRouter);
  });
}

export default router;
