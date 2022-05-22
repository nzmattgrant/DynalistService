import * as dynalistService from './dynalist-service';
import * as config from './config.json';

const templateHashTag = "#daily-template";
const dailyListHashTag = "#today-daily";


//precondition: all checked dailies have already been deleted
const deleteOldDailyList = async () => {
    //TODO!! build and intermediate tree so that it's a lot easier to update things and you are not holding too much stuff in memory
    //It will make things a lot more modular as well and it would be nice to be able to switch out the backend also
    const documentId = config.dynalistTodoListDocumentId;
    const document = await dynalistService.getDocument(documentId);
    const nodes = document.nodes;
    const dailiesNode = nodes.find(node => node.content.includes(dailyListHashTag));
    const subtrees = dynalistService.getSubTreesOrNull(dailiesNode, nodes);
    //const anyChecked = subtrees.find(node => node.checked).length > 0;
    // if(anyChecked){
    //     throw new Error("precondition not met, all checked dailes need to be cleared out first")
    // }
    if(subtrees){
        await dynalistService.deleteNodes(documentId, subtrees.children || []);
    }
};

const createNewDailyList = async () => {
    const documentId = config.dynalistTodoListDocumentId;
    const document = await dynalistService.getDocument(documentId);
    const nodes = document.nodes;
    const templateNode = nodes.find(node => node.content.includes(templateHashTag));
    const dailiesNode = nodes.find(node => node.content.includes(dailyListHashTag));
    const subtrees = dynalistService.getSubTreesOrNull(templateNode, nodes);
    await dynalistService.copySubTrees(subtrees.children, dailiesNode.id, documentId, true);
};

export const updateDailies = async () => {
    await deleteOldDailyList();
    await createNewDailyList();
}