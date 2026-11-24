# Base SmolVLM runs now, behind a swappable model

## Decision

- The server's `/react` runs base SmolVLM (`PUDDLES_MODEL=smolvlm`, 256M by default, 500M via `PUDDLES_SMOLVLM_ID`) behind the `ReactionModel` interface. The LoRA fine-tune (M3) and frontier baselines plug in as more `ReactionModel`s later, without touching the game.
- The prompt lives in `shared/puddles_prompt.md`, next to the schema it asks for, so the server, evals and fine-tuning data share one copy.
- Output is decoded under the reaction schema with xgrammar logits processors, with string lengths capped so a reply always fits the token budget. If xgrammar can't compile the schema for a model's tokenizer, the backend generates freely, then extracts and repairs the first JSON object, and falls back to the game's confused reaction.
- torch, transformers, xgrammar and pillow live in an optional `vlm` dependency group and are imported only when the model loads. CI, agents and the default server never install them.
- The device is picked at load: MPS, then CUDA, then CPU. PyTorch on MPS for play: on the Mac (#104), the 256M names objects at p50 657 ms / p95 1009 ms, and writes a full JSON reaction at p50 2023 ms / p95 2247 ms. MLX is deferred to fine-tuning.

## Why

- A base model behind the interface gets real reactions into playtests now, and gives the fine-tune a measured baseline to beat.
- Constrained decoding makes "always parses" a property of the decoder instead of a hope; repair and the fallback keep the endpoint safe if a model can't be constrained.
- Keeping ML wheels (several GB with CUDA) out of the default install keeps CI and agent runs fast.

## Rejected

- **MLX now.** Mac-only, and PyTorch on MPS is already fast enough for play; PyTorch runs the same code on the Mac, in CI-like sandboxes and on CUDA. Deferred: revisit MLX for fine-tuning speed.
- **Fine-tuning first.** Without a base-model baseline there is nothing to measure the fine-tune against.
- **Repair-only output.** Small models often break JSON; parsing whatever comes back loses more reactions than decoding under the schema.
- **outlines for constrained decoding.** It depends on `diskcache`, which has an unpatched pickle-deserialization advisory (GHSA-w8v5-vhqr-4h9v) that fails dependency review. xgrammar does the same job as a transformers logits processor with no such dependency.
