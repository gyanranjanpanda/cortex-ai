import {
 StateGraph
}
from "@langchain/langgraph";

import {
 AgentState
}
from "./state.js";

import {
 routerNode
}
from "./router.node.js";

import {
 chatAgent
}
from "../agents/chat.agent.js";

import {
 codingAgent
}
from "../agents/coding.agent.js";

import {
 searchAgent
}
from "../agents/search.agent.js";

import {
 pdfAgent
}
from "../agents/pdf.agent.js";
import { pptAgent } from "../agents/ppt.agent.js";
import { imageAgent } from "../agents/imageGen.agent.js";
import { visionAgent } from "../agents/vision.agent.js";
import { pdfRagAgent } from "../agents/pdfRag.agent.js";
import { authorizeToolNode, outputValidationNode } from "../security/nodes.js";

const workflow =
new StateGraph(
 AgentState
);

workflow.addNode(
 "router",
 routerNode
);
workflow.addNode("authorize_tool", authorizeToolNode);
workflow.addNode("validate_output", outputValidationNode);

workflow.addNode(
 "chat",
 chatAgent
);

workflow.addNode(
 "coding",
 codingAgent
);

workflow.addNode(
 "search",
 searchAgent
);

workflow.addNode(
 "pdf",
 pdfAgent
);
workflow.addNode(
 "ppt",
 pptAgent
);
workflow.addNode(
 "image",
 imageAgent
);
workflow.addNode(
 "vision",
 visionAgent
);
workflow.addNode(
 "pdf_rag",
 pdfRagAgent
);
workflow.addEdge(
 "__start__",
 "router"
);
workflow.addEdge("router", "authorize_tool");

workflow.addConditionalEdges(

 "authorize_tool",

 (state)=>{

  switch(state.agent){

   case "search":
    return "search";

   case "coding":
    return "coding";

   case "pdf":
    return "pdf";

    case "ppt":
    return "ppt";

    case "image":
    return "image";

    case "vision":
    return "vision";
    case "pdf_rag":
    return "pdf_rag";

   default:
    return "chat";

  }

 },

 {

  chat:"chat",

  search:"search",

  coding:"coding",

  pdf:"pdf",
   ppt:"ppt",
   image:"image",
   vision:"vision",
   pdf_rag:"pdf_rag"

 }

);

workflow.addEdge(
  "coding",
  "validate_output"
);
workflow.addEdge(
  "image",
  "validate_output"
);

workflow.addEdge(
  "search",
  "chat"
);

workflow.addEdge(
  "pdf",
  "validate_output"
);
workflow.addEdge(
  "ppt",
  "validate_output"
);

workflow.addEdge(
  "chat",
  "validate_output"
);

workflow.addEdge(
    "vision",
    "validate_output"
);

workflow.addEdge(
    "pdf_rag",
    "validate_output"
);
workflow.addEdge("validate_output", "__end__");

export const graph =
workflow.compile();
