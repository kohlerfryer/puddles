import { gameTitle } from "./core/title";
import { drawPond } from "./render/pond";
import { playDemo } from "./render/play";
import { createStage } from "./render/stage";

document.title = gameTitle();
void createStage(document.body).then((app) => {
  playDemo(app, drawPond(app));
});
