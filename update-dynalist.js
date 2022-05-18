const config = require('./config.json');
const _ = require('lodash');
const { LocalDate, ChronoUnit, nativeJs } = require('js-joda');
const moment = require("moment");
const DateUtils = require('./date-utils');
const dailiesService = require('./dailies-service');
const inventoryService = require('./dist/inventory-service');
const DynalistService = require('./dynalist-service');
const journalService = require('./dist/journal-service');
const flashcardService = require('./dist/flashcard-service');
const { DynalistApi } = require('dynalist-api');

const runDynalistUpdates = async () => {

    let todoDocument = await DynalistService.getDocument(config.dynalistTodoListDocumentId);
    var nodes = todoDocument.nodes;
    var tomorrowTodosIds = [];
    var futureTodosIds = [];
    _.forEach(nodes, node => {
        if (node.id == config.dynalistTodoTodayId) {
            currentTodosIds = node.children || [];
        }
        else if (node.id == config.dynalistTodoTomorrowId) {
            tomorrowTodosIds = node.children || [];
        }
        if (node.id == config.dynalistTodoAllId) {
            futureTodosIds = node.children || [];
        }
    });

    var changes = [];

    var positionIndex = 0;
    _.forEach(tomorrowTodosIds, nodeId => {
        changes.push({
            "action": "move",
            "node_id": nodeId,
            "parent_id": config.dynalistTodoTodayId,
            "index": positionIndex
        });
        positionIndex = positionIndex + 1;
    });

    var futureTodos = nodes.filter(n => futureTodosIds.includes(n.id));

    const today = moment().startOf('day');
    positionIndex = 0;
    _.forEach(futureTodos, node => {
        const nodeDate = DateUtils.getDateFromDynalistNote(node.content);
        if ((nodeDate && today >= nodeDate)
             || today.diff(moment(node.modified), "days") > 7) {
            changes.push({
                "action": "move",
                "node_id": node.id,
                "parent_id": config.dynalistTodoTodayId,
                "index": positionIndex
            });
            positionIndex = positionIndex + 1;
        }
    });

    await DynalistService.updateDocument(config.dynalistTodoListDocumentId, changes);

    //todo split these out into diffent files
    changes = [];

    //todo split this into a function
    todoDocument = await DynalistService.getDocument(config.dynalistTodoListDocumentId); 

    nodes = todoDocument.nodes;
    var currentTodos = [];
    var futureTodos = [];
    _.forEach(nodes, node => {
        if (node.id == config.dynalistTodoTodayId) {
            currentTodos = nodes.filter(n => node.children.includes(n.id)) || [];
        }
        if (node.id == config.dynalistTodoAllId) {
            futureTodos = nodes.filter(n => node.children && node.children.includes(n.id)) || [];
        }
    });

    currentTodos = currentTodos.sort((a, b) => (a.color || 4) - (b.color || 4))

    positionIndex = 0;
    _.forEach(currentTodos, node => {
        changes.push({
            "action": "move",
            "node_id": node.id,
            "parent_id": config.dynalistTodoTodayId,
            "index": positionIndex
        });
        positionIndex = positionIndex + 1;
    });

    futureTodos = futureTodos.sort((a, b) => (a.color || 4) - (b.color || 4))

    positionIndex = 0;
    _.forEach(futureTodos, node => {
        changes.push({
            "action": "move",
            "node_id": node.id,
            "parent_id": config.dynalistTodoAllId,
            "index": positionIndex
        });
        positionIndex = positionIndex + 1;
    });

    await DynalistService.updateDocument(config.dynalistTodoListDocumentId, changes);

};


const getPreprocessChanges = async (item, nodes, parentChecked = false) => {
    var changes = [];
    if (item.children) {
        const childrenItems = nodes.filter(node => item.children.includes(node.id))
        for (var childItem of childrenItems) {
            const nextChanges = await getPreprocessChanges(childItem, nodes, parentChecked || item.checked);
            changes = changes.concat(nextChanges)
        }
    }
    if (parentChecked && !item.checked) {
        changes.push({
            "action": "edit",
            "node_id": item.id,
            "checked": true,
            "content": item.content
        });
    }
    return changes;
}

const preprocessSubTrees = async (item, nodes) => {
    const changes = await getPreprocessChanges(item, nodes);
    if (changes.length) {
        await DynalistService.updateDocument(config.dynalistTodoListDocumentId, changes);
        console.log("here");
    }
}

var count = 0;

const copyCheckedSubTrees = async (subTrees, parentId) => {
    if (!subTrees || !subTrees.length) {
        return [];
    }
    var copiedIds = [];
    var changes = [];
    subTrees.forEach((item, i) => {
        count = count + 1;
        changes.push({
            "action": "insert",
            "parent_id": parentId,
            "index": i,
            "content": item.content
        });
        copiedIds.push(item.id);
        if(item.id === undefined){
            console.log(item);
        }
    });
    var result = await DynalistService.updateDocument(config.journalDocumentId, changes);
    //await delay(1000);
    var newIds = result.new_node_ids || [];
    //Assumption is that everything is in the same order as what they were passed in as
    //If not it's really annoying
    for (var i = 0; i < subTrees.length; i++) {
        const copiedChildIds = await copyCheckedSubTrees(subTrees[i].children || [], newIds[i]);
        copiedIds = copiedIds.concat(copiedChildIds);
    }
    return copiedIds;
}

const getCheckedItemDeleteChanges = (subTrees, okToDelete) => {
    var changes = [];
    for (var item of subTrees) {
        if (item.children) {
            const nextChanges = getCheckedItemDeleteChanges(item.children, okToDelete);
            changes = changes.concat(nextChanges)
        }
        if (item.checked && okToDelete.includes(item.id)) {
            changes.push({
                "action": "delete",
                "node_id": item.id,
            });
        }
    }
    return changes;
}

const moveCheckedSubTrees = async (subTrees, parentId) => {
    const copiedIds = await copyCheckedSubTrees(subTrees, parentId);
    const changes = getCheckedItemDeleteChanges(subTrees, copiedIds);
    console.log(count);
    const result = await DynalistService.updateDocument(config.dynalistTodoListDocumentId, changes);
    console.log(result);
}

const archiveTodoList = async (todayTodoEntry, nodes, toMoveToId) => {
    await preprocessSubTrees(todayTodoEntry, nodes);
    var subTrees = DynalistService.getCheckedItemsSubTreesOrNull(todayTodoEntry, nodes);
    subTrees = subTrees && subTrees.children ? subTrees.children : [];
    await moveCheckedSubTrees(subTrees, toMoveToId);
}

const generatePathToNodeString = (node, nodes, documentPath) => {
    const parent = nodes.find(parent => parent.children && parent.children.includes(node.id));
    if(parent){
        documentPath = parent.content + " > " + documentPath;
        return generatePathToNodeString(parent, nodes, documentPath);
    }
    return documentPath
}

const archiveCompletedTodos = async () => {
    //all nodes and todo lists
    const document = await DynalistService.getDocument(config.dynalistTodoListDocumentId);
    const allNodes = document.nodes;
    const todayTodayLists = allNodes.filter(node => node.content.includes(config.todayTodoListTag));
    //journal entries
    const journalDocument = await DynalistService.getDocument(config.journalDocumentId);
    const journalNodes = journalDocument.nodes;
    const yesterdayJournalEntry = journalNodes.find(node => node.content.includes(config.yesterdayTag));
    for (var todayTodoList of todayTodayLists) { 
        const newNodeContent = generatePathToNodeString(todayTodoList, allNodes, todayTodoList.content);
        const newNodeResult = await DynalistService.createNewEntry(config.journalDocumentId, yesterdayJournalEntry.id, newNodeContent);
        const newNodeId = newNodeResult.new_node_ids[0];
        await archiveTodoList(todayTodoList, allNodes, newNodeId);
    }  
}

const addJournalEntriesToJournal = async () => {
    const todoDocument = await DynalistService.getDocument(config.dynalistTodoListDocumentId);
    const journalDocument = await DynalistService.getDocument(config.journalDocumentId);
    const nodes = await DynalistService.filterNodesByContent(todoDocument, config.journalEntryTag);
    const yesterdayNodes = await DynalistService.filterNodesByContent(journalDocument, config.yesterdayTag);
    const yesterdayNode = yesterdayNodes.length > 0 ? yesterdayNodes[0] : null;
    if(!yesterdayNode){
        return;
    }
    nodes.forEach(n => n.content = (n.content || '').replace(config.journalEntryTag, ''));
    console.log(nodes);
    await DynalistService.moveNodesToDifferentDocument(nodes, config.dynalistTodoListDocumentId, config.journalDocumentId, yesterdayNode.id)
}

(async () => {
    const api = new DynalistApi(config.dynalistApiKey);

    console.log(await api.getDocument(config.dynalistSharedDocumentId));

    const runManualOnly = process.argv.includes("--run-manual-only-tasks");
    if(runManualOnly){
        //await flashcardService.updateFlashcardNotes();
        await flashcardService.runAnkiUpdates();
        return;
    }

    await flashcardService.updateFlashcardNotes();
    
    await journalService.createJournalEntries();

    await archiveCompletedTodos();

    await addJournalEntriesToJournal();

    await runDynalistUpdates();

    await dailiesService.updateDailies();

    await inventoryService.updateInventory();
})();


