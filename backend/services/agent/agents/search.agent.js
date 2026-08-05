import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";
import { searchTool } from "../utils/tavily.js";
import { sanitizeUntrustedText } from "../security/inputSecurity.js";



export const searchAgent =
async(state)=>{
await checkAgentLimit(
    state.userId,
    "search"
  );
  await deductCredits(

        state.userId,

        "search"

    ); 
 try{

  const results =
  await searchTool.invoke({

 query:state.prompt

} );

  return {

   ...state,

   searchResults:
   sanitizeUntrustedText(JSON.stringify(results)),
   

  };

 }catch(error){

  console.log(error);

  return {

   ...state,

   searchResults:[]

  };

 }

};
