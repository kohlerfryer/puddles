import { gameTitle } from "./core/title";
import { drawPond } from "./render/pond";
import { createStage } from "./render/stage";

document.title = gameTitle();
void createStage(document.body).then(drawPond);
