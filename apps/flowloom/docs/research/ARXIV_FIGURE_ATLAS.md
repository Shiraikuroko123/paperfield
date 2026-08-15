# arXiv LLM 与具身智能 Figure Atlas

生成时间：2026-07-28T10:57:22.610Z。本报告由可重复运行的 `scripts/research-arxiv-figures.mjs` 生成。引用数来自 Semantic Scholar 快照，仅用于候选排序；Figure 与 caption 来自 ar5iv，失败时回退 arXiv HTML。论文图片只下载到被 Git 忽略的 `output/research` 用于人工观察，不进入产品素材库。

## 方法边界

- 样本按六个主题检索并加入奠基性种子，再按主题配额、引用与时间进行分层选择；它是设计语料，不是系统综述或学术排名。
- 自动标签来自 caption 关键词，后续必须结合 contact sheet 人工复核；统计不能替代对原图的视觉检查。
- 产品只吸收构图语法和通用视觉模式，不复制论文原图、品牌资产或受限许可素材。

## LLM

论文数：50；成功提取 Figure 的论文：50；解析到的 Figure 总数：656。

### 代表图构图类型

| 类型 | 论文数 |
| --- | ---: |
| quantitative-chart | 21 |
| training-pipeline | 19 |
| system-overview | 18 |
| model-architecture | 14 |
| data-pipeline | 8 |
| taxonomy-benchmark | 8 |
| agent-loop | 6 |
| qualitative-montage | 5 |
| other | 4 |
| temporal-storyboard | 2 |

### 代表图视觉元素

| 元素 | 论文数 |
| --- | ---: |
| module-blocks | 45 |
| token-sequence | 39 |
| chart-axes | 19 |
| stage-containers | 14 |
| image-strip | 12 |
| loss-objective | 10 |
| dataset-stack | 7 |
| frozen-trainable-state | 5 |
| annotations-callouts | 4 |
| attention-bridge | 4 |
| feedback-arrow | 4 |
| heatmap-matrix | 1 |
| legend-encoding | 1 |

### 论文与 Figure 证据

| # | 论文 | 年份 | 引用 | Figure 数 | 代表 Figure | Caption |
| ---: | --- | ---: | ---: | ---: | --- | --- |
| 1 | [DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via R...](https://arxiv.org/abs/2501.12948) | 2025 | 5452 | 3 | Figure 1: | Figure 1: Benchmark performance of DeepSeek-R1. |
| 2 | [Stop Overthinking: A Survey on Efficient Reasoning for Large ...](https://arxiv.org/abs/2503.16419) | 2025 | 424 | 7 | Figure 1: | Figure 1: The pipeline of developing efficient reasoning for LLMs. A reasoning model can be trained on the base model using SFT, RL, or a combination of both. ... |
| 3 | [Large Language Model Agent: A Survey on Methodology, Applicat...](https://arxiv.org/abs/2503.21460) | 2025 | 194 | 3 | Figure 1: | Figure 1: An overview of the LLM agent ecosystem organized into four interconnected dimensions: ❶ Agent Methodology, covering the foundational aspects of const... |
| 4 | [ReasoningBank: Scaling Agent Self-Evolving with Reasoning Mem...](https://arxiv.org/abs/2509.25140) | 2025 | 143 | 15 | Figure 2: | Figure 2: Overview of ReasoningBank. Experiences are distilled into structured memory items with a title, description, and content. For each new task, the agen... |
| 5 | [A Comprehensive Survey on Long Context Language Modeling](https://arxiv.org/abs/2503.17407) | 2025 | 125 | 9 | Figure 3: | Figure 3: Illustration of training pipeline of LCLMs. |
| 6 | [Scalable Vision Language Model Training via High Quality Data...](https://arxiv.org/abs/2501.05952) | 2025 | 56 | 8 | Figure 1: | Figure 1: SAIL-VL’s overall model training pipeline. |
| 7 | [Automated Generation of Challenging Multiple-Choice Questions...](https://arxiv.org/abs/2501.03225) | 2025 | 39 | 11 | Figure 1: | Figure 1: Overview. (Left) We analyze existing open-ended VQA evaluation metrics, underscoring their limitations in providing accurate and reproducible assessm... |
| 8 | [HiDe-LLaVA: Hierarchical Decoupling for Continual Instruction...](https://arxiv.org/abs/2503.12941) | 2025 | 30 | 9 | Figure 3: | Figure 3: An overview of HiDe-LLaVA framework. (a) During training, we optimize the LoRA modules and projector layer with an autoregressive loss and the image-... |
| 9 | [G$^2$VLM: Geometry Grounded Vision Language Model with Unifie...](https://arxiv.org/abs/2511.21688) | 2025 | 26 | 5 | Figure 2: | Figure 2: Our model, G2VLM, employs an architecture inspired by the two-streams hypothesis. It features two experts: a geometric perception expert (our “where ... |
| 10 | [The Llama 3 Herd of Models](https://arxiv.org/abs/2407.21783) | 2024 | 17216 | 13 | Figure 1: | Figure 1: Illustration of the overall architecture and training of Llama 3. Llama 3 is a Transformer language model trained to predict the next token of a text... |
| 11 | [Qwen2 Technical Report](https://arxiv.org/abs/2407.10671) | 2024 | 2361 | 1 | Figure 1: | Figure 1: Performance of Qwen2 instruction-tuned models on Needle in A Haystack Test. All models that supports context lengths above 32k tokens integrates the ... |
| 12 | [Phi-3 Technical Report: A Highly Capable Language Model Local...](https://arxiv.org/abs/2404.14219) | 2024 | 2358 | 4 | Figure 1: | Figure 1: 4-bit quantized phi-3-mini running natively on an iPhone with A16 Bionic chip, generating over 12 tokens per second. |
| 13 | [Mixtral of Experts](https://arxiv.org/abs/2401.04088) | 2024 | 2027 | 9 | Figure 1: | Figure 1: Mixture of Experts Layer. Each input vector is assigned to 2 of the 8 experts by a router. The layer’s output is the weighted sum of the outputs of t... |
| 14 | [DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-E...](https://arxiv.org/abs/2405.04434) | 2024 | 1325 | 7 | Figure 2: | Figure 2: Illustration of the architecture of DeepSeek-V2. MLA ensures efficient inference by significantly reducing the KV cache for generation, and DeepSeekM... |
| 15 | [Gemma: Open Models Based on Gemini Research and Technology](https://arxiv.org/abs/2403.08295) | 2024 | 1155 | 4 | Figure 1: | Figure 1: Language understanding and generation performance of Gemma 7B across different capabilities compared to similarly sized open models. We group togethe... |
| 16 | [DeepSeek LLM: Scaling Open-Source Language Models with Longte...](https://arxiv.org/abs/2401.02954) | 2024 | 808 | 19 | Figure 1: | Figure 1: Training loss curves with different learning rate schedulers or different parameters for schedulers. The model size is 1.6 billion parameters, traine... |
| 17 | [QServe: W4A8KV4 Quantization and System Co-design for Efficie...](https://arxiv.org/abs/2405.04532) | 2024 | 232 | 19 | Figure 1: | Figure 1: QServe achieves higher throughput when running Llama models on L40S compared with TensorRT-LLM on A100, effectively saves the dollar cost for LLM ser... |
| 18 | [Blended RAG: Improving RAG (Retriever-Augmented Generation) A...](https://arxiv.org/abs/2404.07220) | 2024 | 184 | 18 | Figure 1: | Figure 1: Scheme of Creating Blended Retrievers using Semantic Search with Hybrid Queries. |
| 19 | [Observational Scaling Laws and the Predictability of Language...](https://arxiv.org/abs/2405.10938) | 2024 | 133 | 80 | Figure 4: | Figure 4: “Emergent” capabilities of LMs can be accurately predicted from weaker models to stronger ones with observational scaling laws, and using PC measures... |
| 20 | [KG-Agent: An Efficient Autonomous Agent Framework for Complex...](https://arxiv.org/abs/2402.11163) | 2024 | 126 | 4 | Figure 1: | Figure 1: The overview of our proposed KG-Agent. The top half is the workflow of our agent, and the bottom half is an example of instruction fine-tuning data s... |
| 21 | [Image Fusion via Vision-Language Model](https://arxiv.org/abs/2402.02235) | 2024 | 95 | 7 | Figure 1: | Figure 1: Workflow for our FILM. Input images are first processed to create prompts for the ChatGPT model, which then generate detailed textual descriptions. T... |
| 22 | [SPA-VL: A Comprehensive Safety Preference Alignment Dataset f...](https://arxiv.org/abs/2406.12030) | 2024 | 83 | 19 | Figure 3: | Figure 3: Impact of Data Scale on Alignment Model Performance. Line plots illustrate the effect of varying data quantities (100100100, 1​k1𝑘1k, 5​k5𝑘5k, 10​k... |
| 23 | [Vision-Flan: Scaling Human-Labeled Tasks in Visual Instructio...](https://arxiv.org/abs/2402.11690) | 2024 | 82 | 91 | Figure 3: | Figure 3: The left of the figure shows the LLaVA-Architecture and the right of the figure shows the two-stage visual instruction tuning pipeline. |
| 24 | [Identifying Implicit Social Biases in Vision-Language Models](https://arxiv.org/abs/2411.00997) | 2024 | 49 | 8 | Figure 2: | Figure 2: Flowchart demonstrating the process for image retrieval in FairFace. For each word of interest in each category, we compute its embedding with the CL... |
| 25 | [Multi-modal Preference Alignment Remedies Degradation of Visu...](https://arxiv.org/abs/2402.10884) | 2024 | 38 | 3 | Figure 1: | Figure 1: Starting from an SFT-ed checkpoint, we generate 4 completions for a given image-question prompt. These answers are then presented to Gemini to obtain... |
| 26 | [VividMed: Vision Language Model with Versatile Visual Groundi...](https://arxiv.org/abs/2410.12694) | 2024 | 30 | 11 | Figure 1: | Figure 1: The architecture of VividMed, which is built upon a base VLM (left and lower) and a promptable localization module (upper right). The model identifie... |
| 27 | [DeepSeek-V3 Technical Report](https://arxiv.org/abs/2412.19437) | 2024 | 0 | 16 | Figure 2: | Figure 2: Illustration of the basic architecture of DeepSeek-V3. Following DeepSeek-V2, we adopt MLA and DeepSeekMoE for efficient inference and economical tra... |
| 28 | [GPT-4 Technical Report](https://arxiv.org/abs/2303.08774) | 2023 | 26240 | 9 | Figure 1: | Figure 1: Performance of GPT-4 and smaller models. The metric is final loss on a dataset derived from our internal codebase. This is a convenient, large datase... |
| 29 | [LLaMA: Open and Efficient Foundation Language Models](https://arxiv.org/abs/2302.13971) | 2023 | 20965 | 2 | Figure 1: | Figure 1: Training loss over train tokens for the 7B, 13B, 33B, and 65 models. LLaMA-33B and LLaMA-65B were trained on 1.4T tokens. The smaller models were tra... |
| 30 | [Llama 2: Open Foundation and Fine-Tuned Chat Models](https://arxiv.org/abs/2307.09288) | 2023 | 17722 | 38 | Figure 4: | Figure 4: Training of Llama 2-Chat: This process begins with the pretraining of Llama 2 using publicly available online sources. Following this, we create an i... |
| 31 | [Visual Instruction Tuning](https://arxiv.org/abs/2304.08485) | 2023 | 10472 | 7 | Figure 1: | Figure 1: LLaVA network architecture. |
| 32 | [Direct Preference Optimization: Your Language Model is Secret...](https://arxiv.org/abs/2305.18290) | 2023 | 9783 | 5 | Figure 3: | Figure 3: Left. Win rates computed by GPT-4 for Anthropic-HH one-step dialogue; DPO is the only method that improves over chosen summaries in the Anthropic-HH ... |
| 33 | [BLIP-2: Bootstrapping Language-Image Pre-training with Frozen...](https://arxiv.org/abs/2301.12597) | 2023 | 8722 | 7 | Figure 1: | Figure 1: Overview of BLIP-2’s framework. We pre-train a lightweight Querying Transformer following a two-stage strategy to bridge the modality gap. The first ... |
| 34 | [Mamba: Linear-Time Sequence Modeling with Selective State Spa...](https://arxiv.org/abs/2312.00752) | 2023 | 8237 | 17 | Figure 1: | Figure 1: (Overview.) Structured SSMs independently map each channel (e.g. D=5D=5) of an input xx to output yy through a higher dimensional latent state hh (e.... |
| 35 | [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314) | 2023 | 5143 | 6 | Figure 1: | Figure 1: Different finetuning methods and their memory requirements. QLoRA improves over LoRA by quantizing the transformer model to 4-bit precision and using... |
| 36 | [Toolformer: Language Models Can Teach Themselves to Use Tools](https://arxiv.org/abs/2302.04761) | 2023 | 4847 | 4 | Figure 1: | Figure 1: Exemplary predictions of Toolformer. The model autonomously decides to call different APIs (from top to bottom: a question answering system, a calcul... |
| 37 | [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) | 2023 | 4423 | 16 | Figure 1: | Figure 1: Changing the location of relevant information (in this case, the position of the passage that answers an input question) within the language model’s ... |
| 38 | [Mistral 7B](https://arxiv.org/abs/2310.06825) | 2023 | 3707 | 6 | Figure 4: | Figure 4: Performance of Mistral 7B and different Llama models on a wide range of benchmarks. All models were re-evaluated on all metrics with our evaluation p... |
| 39 | [Self-RAG: Learning to Retrieve, Generate, and Critique throug...](https://arxiv.org/abs/2310.11511) | 2023 | 2248 | 9 | Figure 1: | Figure 1: Overview of Self-Rag. Self-Rag learns to retrieve, critique, and generate text passages to enhance overall generation quality, factuality, and verifi... |
| 40 | [Instruction Tuning for Large Language Models: A Survey](https://arxiv.org/abs/2308.10792) | 2023 | 908 | 13 | Figure 1: | Figure 1: General pipeline of instruction tuning. |
| 41 | [What Makes Good Data for Alignment? A Comprehensive Study of ...](https://arxiv.org/abs/2312.15685) | 2023 | 409 | 6 | Figure 1: | Figure 1: Illustration of the data selection approach. We measure data from three dimensions: complexity, quality, and diversity. I𝐼I and R𝑅R represent instr... |
| 42 | [GraphGPT: Graph Instruction Tuning for Large Language Models](https://arxiv.org/abs/2310.13023) | 2023 | 367 | 5 | Figure 2. | Figure 2. The overall architecture of our proposed GraphGPT with graph instruction tuning paradigm. |
| 43 | [LongLoRA: Efficient Fine-tuning of Long-Context Large Languag...](https://arxiv.org/abs/2309.12307) | 2023 | 279 | 9 | Figure 2: | Figure 2: Overview of LongLoRA. We introduce Shifted Sparse Attention (S2-Attn) during fine-tuning. The trained model retains original standard self-attention ... |
| 44 | [LooGLE: Can Long-Context Language Models Understand Long Cont...](https://arxiv.org/abs/2311.04939) | 2023 | 263 | 12 | Figure 3: | Figure 3: An overview performance of LLMs on LooGLE for long context understanding |
| 45 | [Scaling Vision-Language Models with Sparse Mixture of Experts](https://arxiv.org/abs/2303.07226) | 2023 | 121 | 10 | Figure 2: | Figure 2: Effect of VL-MoE scaling on three mask language modeling (MLM), mask image modeling (MIM), and masked vision-language modeling (VLM) pre-training tas... |
| 46 | [Attention Sorting Combats Recency Bias In Long Context Langua...](https://arxiv.org/abs/2310.01427) | 2023 | 110 | 7 | Figure 4: | Figure 4: An illustration of the attention sorting procedure. Average per-document attention is computed for the first generated response token, and then docum... |
| 47 | [LQ-LoRA: Low-rank Plus Quantized Matrix Decomposition for Eff...](https://arxiv.org/abs/2311.12023) | 2023 | 102 | 7 | Figure 1: | Figure 1: (Left) The decomposition error ‖𝐖−(𝐐+𝐋1​𝐋2)‖Fsubscriptnorm𝐖𝐐subscript𝐋1subscript𝐋2𝐹\\|\mathbf{W}-(\mathbf{Q}+\mathbf{L}_{1}\mathbf{L}_{2})\\|_... |
| 48 | [PB-LLM: Partially Binarized Large Language Models](https://arxiv.org/abs/2310.00034) | 2023 | 100 | 29 | Figure 7: | Figure 7: QAT training results with 30% salient weights PB-LLM (upper two lines): As fine-tuning epochs increase, quantized models swiftly regain their reasoni... |
| 49 | [Training language models to follow instructions with human fe...](https://arxiv.org/abs/2203.02155) | 2022 | 22824 | 25 | Figure 2: | Figure 2: A diagram illustrating the three steps of our method: (1) supervised fine-tuning (SFT), (2) reward model (RM) training, and (3) reinforcement learnin... |
| 50 | [Chain-of-Thought Prompting Elicits Reasoning in Large Languag...](https://arxiv.org/abs/2201.11903) | 2022 | 20479 | 4 | Figure 1: | Figure 1: Chain-of-thought prompting enables large language models to tackle complex arithmetic, commonsense, and symbolic reasoning tasks. Chain-of-thought re... |

## 具身智能 / VLA

论文数：50；成功提取 Figure 的论文：50；解析到的 Figure 总数：633。

### 代表图构图类型

| 类型 | 论文数 |
| --- | ---: |
| system-overview | 27 |
| training-pipeline | 20 |
| model-architecture | 15 |
| data-pipeline | 11 |
| quantitative-chart | 11 |
| agent-loop | 7 |
| temporal-storyboard | 7 |
| qualitative-montage | 6 |
| taxonomy-benchmark | 4 |
| other | 3 |

### 代表图视觉元素

| 元素 | 论文数 |
| --- | ---: |
| robot-embodiment | 48 |
| action-trajectory | 38 |
| module-blocks | 38 |
| token-sequence | 33 |
| image-strip | 29 |
| stage-containers | 13 |
| attention-bridge | 10 |
| dataset-stack | 10 |
| chart-axes | 8 |
| environment-scene | 8 |
| frozen-trainable-state | 6 |
| legend-encoding | 2 |
| loss-objective | 2 |
| annotations-callouts | 1 |
| feedback-arrow | 1 |

### 论文与 Figure 证据

| # | 论文 | 年份 | 引用 | Figure 数 | 代表 Figure | Caption |
| ---: | --- | ---: | ---: | ---: | --- | --- |
| 1 | [CoT-VLA: Visual Chain-of-Thought Reasoning for Vision-Languag...](https://arxiv.org/abs/2503.22020) | 2025 | 502 | 6 | Figure 1: | Figure 1: Comparison between vanilla VLA and CoT-VLA frameworks. Prior VLA models (top) directly predict robot actions from task inputs without explicit reason... |
| 2 | [SpatialVLA: Exploring Spatial Representations for Visual-Lang...](https://arxiv.org/abs/2501.15830) | 2025 | 464 | 9 | Figure 1: | Figure 1: Overview of SpatialVLA. Given an image observation 𝐨t\mathbf{o}_{t} and a task instruction 𝐋\mathbf{L}, the model processes the image using Ego3D P... |
| 3 | [Unified Vision-Language-Action Model](https://arxiv.org/abs/2506.19850) | 2025 | 112 | 5 | Figure 1: | Figure 1: We present UniVLA, a unified vision-language-action model. Unlike prior VLA approaches that typically rely on an extra vision encoder to extract imag... |
| 4 | [Learning Humanoid Standing-up Control across Diverse Postures](https://arxiv.org/abs/2502.08378) | 2025 | 91 | 10 | Figure 2: | Figure 2: Framework overview. (a) We train policies in simulation from scratch with multiple critics and motion constraints operationalized by rewards, smoothn... |
| 5 | [Dita: Scaling Diffusion Transformer for Generalist Vision-Lan...](https://arxiv.org/abs/2503.19757) | 2025 | 78 | 10 | Figure 1: | Figure 1: Illustrations of different generalist robot policy architectures. Left head: the common robot Transformer architecture with discretization actions, e... |
| 6 | [Large VLM-based Vision-Language-Action Models for Robotic Man...](https://arxiv.org/abs/2508.13073) | 2025 | 75 | 7 | Figure 1: | Figure 1: Illustration of core advantages of large VLM-based Vision-Language-Action (VLA) models for robotic manipulation. Large VLM-based VLA models leverages... |
| 7 | [RoboArena: Distributed Real-World Evaluation of Generalist Ro...](https://arxiv.org/abs/2506.18123) | 2025 | 66 | 11 | Figure 1: | Figure 1: We present RoboArena, a distributed real-world evaluation framework for generalist robot policies. Instead of standardizing environments and tasks, R... |
| 8 | [InternVLA-M1: A Spatially Guided Vision-Language-Action Frame...](https://arxiv.org/abs/2510.13778) | 2025 | 64 | 12 | Figure 1: | Figure 1: InternVLA-M1 integrates spatial grounding into the vision–language–action training pipeline. Given a task instruction, the VLM planner produces laten... |
| 9 | [Learning Getting-Up Policies for Real-World Humanoid Robots](https://arxiv.org/abs/2502.12152) | 2025 | 61 | 6 | Figure 2: | Figure 2: HumanUP system overview. Our getting-up policy (Section III-A) is trained in simulation using two-stage RL training, after which it is directly deplo... |
| 10 | [FLOWER: Democratizing Generalist Robot Policies with Efficien...](https://arxiv.org/abs/2509.04996) | 2025 | 58 | 16 | Figure 1: | Figure 1: Intermediate fusion for efficient VLA policies. Our fusion strategy (top-right) strategically prunes VLM layers while enhancing Flow Transformer capa... |
| 11 | [InstructVLA: Vision-Language-Action Instruction Tuning from U...](https://arxiv.org/abs/2507.17520) | 2025 | 58 | 31 | Figure 1: | Figure 1: Method overview. InstructVLA integrates robust multimodal understanding with precise instruction-driven robotic control, leveraging the world knowled... |
| 12 | [Beyond Sight: Finetuning Generalist Robot Policies with Heter...](https://arxiv.org/abs/2501.04693) | 2025 | 55 | 9 | Figure 5: | Figure 5: FuSe performance on evaluation tasks compared against baselines. Our approach outperforms baselines trained from scratch or finetuned with vision onl... |
| 13 | [MoManipVLA: Transferring Vision-language-action Models for Ge...](https://arxiv.org/abs/2503.13446) | 2025 | 48 | 2 | Figure 2: | Figure 2: The pipeline of MoManipVLA. The pre-trained VLA models predict highly generalized end-effector waypoints to guide the mobile manipulation task, throu... |
| 14 | [RoboGround: Robotic Manipulation with Grounded Vision-Languag...](https://arxiv.org/abs/2504.21530) | 2025 | 46 | 8 | Figure 2: | Figure 2: Data Generation Pipeline. The pipeline is composed of three key stages: (a) First, we extract informative object attributes in both keyword and descr... |
| 15 | [Vision Language Action Models in Robotic Manipulation: A Syst...](https://arxiv.org/abs/2507.10672) | 2025 | 46 | 10 | Figure 2: | Figure 2: Overview of the skeleton of the paper, highlighting the main sections and their interrelated subtopics. |
| 16 | [Embodied-R1: Reinforced Embodied Reasoning for General Roboti...](https://arxiv.org/abs/2508.13998) | 2025 | 40 | 10 | Figure 1: | Figure 1: The Embodied-R1 framework for zero-shot robotic manipulation through “pointing”. Embodied-R1 takes visual and textual instructions, performs explicit... |
| 17 | [OpenVLA: An Open-Source Vision-Language-Action Model](https://arxiv.org/abs/2406.09246) | 2024 | 2823 | 9 | Figure 1: | Figure 1: OpenVLA model architecture. Given an image observation and a language instruction, the model predicts 7-dimensional robot control actions. The archit... |
| 18 | [$π_0$: A Vision-Language-Action Flow Model for General Robot ...](https://arxiv.org/abs/2410.24164) | 2024 | 2244 | 13 | Figure 3: | Figure 3: Overview of our framework. We start with a pre-training mixture, which consists of both our own dexterous manipulation datasets and open-source data.... |
| 19 | [Octo: An Open-Source Generalist Robot Policy](https://arxiv.org/abs/2405.12213) | 2024 | 1581 | 6 | Figure 0: | Figure 0: Model architecture. Left: Octo tokenizes task descriptions (green) and input observations (blue) using a pretrained language model and a lightweight ... |
| 20 | [DROID: A Large-Scale In-The-Wild Robot Manipulation Dataset](https://arxiv.org/abs/2403.12945) | 2024 | 920 | 14 | Figure 6: | Figure 6: Does DROID Improve Policy Performance and Robustness? We find that across all our evaluation tasks, co-training with DROID significantly improves bot... |
| 21 | [RDT-1B: a Diffusion Foundation Model for Bimanual Manipulation](https://arxiv.org/abs/2410.07864) | 2024 | 764 | 14 | Figure 1: | Figure 1: Overview of Robotics Diffusion Transformer with 1B-Parameters (RDT-1B), a language-conditioned visuomotor policy for bimanual manipulation,with state... |
| 22 | [Mobile ALOHA: Learning Bimanual Mobile Manipulation with Low-...](https://arxiv.org/abs/2401.02117) | 2024 | 716 | 7 | Figure 2: | Figure 2: Task Definitions. We illustrate 6 real-world tasks that Mobile ALOHA can perform autonomously. The 7th task High Five is illustrated in the Appendix ... |
| 23 | [CogACT: A Foundational Vision-Language-Action Model for Syner...](https://arxiv.org/abs/2411.19650) | 2024 | 391 | 12 | Figure 2: | Figure 2: Overview of our architecture. Our model is componentized into three parts: 1) a vision module encoding information from the current image observation... |
| 24 | [TinyVLA: Towards Fast, Data-Efficient Vision-Language-Action ...](https://arxiv.org/abs/2409.12514) | 2024 | 391 | 9 | Figure 2: | Figure 2: Model architecture.The left image illustrates the VLM pretraining pipeline, whereas the right image demonstrates the process of training TinyVLA usin... |
| 25 | [3D-VLA: A 3D Vision-Language-Action Generative World Model](https://arxiv.org/abs/2403.09631) | 2024 | 365 | 6 | Figure 2: | Figure 2: Overview of our 3D-VLA pipeline. The left part shows our goal-generation capability. Our model can imagine the final state image and point cloud base... |
| 26 | [Robotic Control via Embodied Chain-of-Thought Reasoning](https://arxiv.org/abs/2407.08693) | 2024 | 361 | 10 | Figure 4: | Figure 4: Our pipeline for generating synthetic embodied chain-of-thought data at scale for a given robot dataset. We use a Prismatic VLM [35] to create a scen... |
| 27 | [HumanPlus: Humanoid Shadowing and Imitation from Humans](https://arxiv.org/abs/2406.10454) | 2024 | 333 | 6 | Figure 2: | Figure 2: Shadowing and Retargeting. Our system uses one RGB camera for body and hand pose estimation. |
| 28 | [Aligning Cyber Space with Physical World: A Comprehensive Sur...](https://arxiv.org/abs/2407.06886) | 2024 | 324 | 18 | Figure 2: | Figure 2: The overall framework of the embodied agent based on MLMs and WMs. The embodied agent has a embodied world model as its “brain”. It has the capabilit... |
| 29 | [Video Prediction Policy: A Generalist Robot Policy with Predi...](https://arxiv.org/abs/2412.14803) | 2024 | 256 | 42 | Figure 2: | Figure 2: We use the video diffusion model as a vision encoder to obtain the predictive representations that explicitly express both current and sequential fut... |
| 30 | [Whole-body Humanoid Robot Locomotion with Human Reference](https://arxiv.org/abs/2402.18294) | 2024 | 83 | 7 | Figure 3: | Figure 3: Adversarial Motion Priors Imitation Training Framework of Humanoid Robot |
| 31 | [Generalizable Humanoid Manipulation with 3D Diffusion Policies](https://arxiv.org/abs/2410.10803) | 2024 | 61 | 8 | Figure 2: | Figure 2: Overview of our system. Our system mainly consists of four parts: the humanoid robot platform, the data collection system, the visuomotor policy lear... |
| 32 | [Towards Generalizable Vision-Language Robotic Manipulation: A...](https://arxiv.org/abs/2410.01345) | 2024 | 51 | 7 | Figure 2: | Figure 2: Overview of 3D-LOTUS++ framework. It leverages generalization capabilities of foundation models for planning and perception, and strong action execut... |
| 33 | [BadRobot: Jailbreaking Embodied LLM Agents in the Physical Wo...](https://arxiv.org/abs/2407.20242) | 2024 | 48 | 4 | Figure 2: | Figure 2: (Overview) LLM-based embodied AI face three risks in real-world applications: (a): inducing harmful behaviors by leveraging jailbroken LLMs. (b): saf... |
| 34 | [Diffusion Policy: Visuomotor Policy Learning via Action Diffu...](https://arxiv.org/abs/2303.04137) | 2023 | 3775 | 12 | Figure 3: | Figure 3: Diffusion Policy Overview a) General formulation. At time step t𝑡t, the policy takes the latest Tosubscript𝑇𝑜T_{o} steps of observation data Otsub... |
| 35 | [RT-2: Vision-Language-Action Models Transfer Web Knowledge to...](https://arxiv.org/abs/2307.15818) | 2023 | 3705 | 12 | Figure 1: | Figure 1: RT-2 overview: we represent robot actions as another language, which can be cast into text tokens and trained together with Internet-scale vision-lan... |
| 36 | [PaLM-E: An Embodied Multimodal Language Model](https://arxiv.org/abs/2303.03378) | 2023 | 2939 | 7 | Figure 3: | Figure 3: Overview of transfer learning demonstrated by PaLM-E: across three different robotics domains, using PaLM and ViT pretraining together with the full ... |
| 37 | [Learning Fine-Grained Bimanual Manipulation with Low-Cost Har...](https://arxiv.org/abs/2304.13705) | 2023 | 2065 | 10 | Figure 1: | Figure 1: Left: Camera viewpoints of the front, top, and two wrist cameras, together with an illustration of the bimanual workspace of ALOHA. Middle: Detailed ... |
| 38 | [Voyager: An Open-Ended Embodied Agent with Large Language Mod...](https://arxiv.org/abs/2305.16291) | 2023 | 2021 | 14 | Figure 8: | Figure 8: Zero-shot generalization to unseen tasks. We visualize the intermediate progress of each method on two tasks. See Appendix, Sec. A.3 for the other tw... |
| 39 | [Open X-Embodiment: Robotic Learning Datasets and RT-X Models](https://arxiv.org/abs/2310.08864) | 2023 | 1112 | 4 | Figure 1: | Figure 1: RT-1-X and RT-2-X both take images and a text instruction as input and output discretized end-effector actions. RT-1-X is an architecture designed fo... |
| 40 | [BridgeData V2: A Dataset for Robot Learning at Scale](https://arxiv.org/abs/2308.12952) | 2023 | 767 | 8 | Figure 2: | Figure 2: (System setup) A picture of our robot setup showing the WidowX 250 robot arm and various cameras. For sensing, we use an RGBD camera that is fixed in... |
| 41 | [EmbodiedGPT: Vision-Language Pre-Training via Embodied Chain ...](https://arxiv.org/abs/2305.15021) | 2023 | 433 | 21 | Figure 2: | Figure 2: Overall framework of EmbodiedGPT. The black arrow shows the vision-language planning process, while the red arrow represents that we leverage the que... |
| 42 | [Vision-Language Foundation Models as Effective Robot Imitators](https://arxiv.org/abs/2311.01378) | 2023 | 421 | 14 | Figure 2: | Figure 2: The illustration of the proposed RoboFlamingo framework. The Flamingo backbone models single-step observations, and the temporal features are modeled... |
| 43 | [Real-World Humanoid Locomotion with Reinforcement Learning](https://arxiv.org/abs/2303.03381) | 2023 | 399 | 8 | Figure 7: | Figure 7: Overview of the method. (A) Our training consists of two steps. First, we assume that the environment is fully observable and train a teacher state p... |
| 44 | [Unleashing Large-Scale Video Generative Pre-training for Visu...](https://arxiv.org/abs/2312.13139) | 2023 | 381 | 12 | Figure 1: | Figure 1: Overview of GR-1. GR-1 is first pre-trained on the task of video prediction with a large-scale video dataset. It is then finetuned on robot data to l... |
| 45 | [Physically Grounded Vision-Language Models for Robotic Manipu...](https://arxiv.org/abs/2309.02561) | 2023 | 269 | 8 | Figure 1: | Figure 1: (a) We collect physical concept annotations of common household objects for fine-tuning VLMs. (b) We use the fine-tuned VLM in an LLM-based robotic p... |
| 46 | [Open-World Object Manipulation using Pre-trained Vision-Langu...](https://arxiv.org/abs/2303.00905) | 2023 | 239 | 12 | Figure 1: | Figure 1: Overview of MOO. We train a language-conditioned policy conditioned on object locations from a frozen VLM. The policy is trained on demonstrations sp... |
| 47 | [RoboCat: A Self-Improving Generalist Agent for Robotic Manipu...](https://arxiv.org/abs/2306.11706) | 2023 | 120 | 79 | Figure 3: | Figure 3: The real-world object sets used by RoboCat. The first two object sets are used to systematically study structure-building and insertion affordances, ... |
| 48 | [Do As I Can, Not As I Say: Grounding Language in Robotic Affo...](https://arxiv.org/abs/2204.01691) | 2022 | 3410 | 37 | (a) | (a) The affordance model fails to identify either bag of chips as pickable, though the language model approaches the counter twice. |
| 49 | [RT-1: Robotics Transformer for Real-World Control at Scale](https://arxiv.org/abs/2212.06817) | 2022 | 2561 | 15 | Figure 1: | Figure 1: A high-level overview of RT-1’s architecture, dataset, and evaluation. |
| 50 | [Code as Policies: Language Model Programs for Embodied Control](https://arxiv.org/abs/2209.07753) | 2022 | 1701 | 6 | Figure 2: | Figure 2: Code as Policies can follow natural language instructions across diverse domains and robots: table-top manipulation (a)-(b), 2D shape drawing (c), an... |
