import api from "../utils/axios";


export const sendPrompt =async(payload, modality = "chat")=>{

 const endpoint = modality === "image"
  ? "/api/agent/image"
  : modality === "rag"
    ? "/api/agent/rag"
    : "/api/agent/chat";
 const { data } =await api.post(endpoint,payload);
console.log(data)
 return data;

};
