import { gameTitle } from "./core/title";
import { createStage } from "./render/stage";

document.title = gameTitle();
void createStage(document.body);
