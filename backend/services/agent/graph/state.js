import { Annotation } from "@langchain/langgraph";

export const AgentState =
Annotation.Root({

 prompt:
 Annotation(),

 conversationId:
 Annotation(),

  userId:
 Annotation(),

 tenantId:
 Annotation(),

 traceId:
 Annotation(),

 approvalId:
 Annotation(),

 requestPolicy:
 Annotation(),

 proposedTool:
 Annotation(),

 policyDecision:
 Annotation(),

 modality:
 Annotation(),

 classifierSignals:
 Annotation(),

 budgetReservation:
 Annotation(),

 toolArgs:
 Annotation(),

 resource:
 Annotation(),

 agent:
 Annotation(),

 response:
 Annotation(),

 images:
  Annotation(),
 model:
 Annotation(),
  file:
 Annotation(),

 artifacts:
 Annotation(),

 searchResults:
 Annotation(),

 codeContext:
 Annotation(),

 pdfContext:
 Annotation()

});
