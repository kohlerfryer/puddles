import { gameTitle } from "./core/title";
import { drawPond } from "./render/pond";
import { drawPuddles } from "./render/puddles";
import { createStage } from "./render/stage";

document.title = gameTitle();
void createStage(document.body).then((app) => drawPuddles(app, drawPond(app)));
