const config = require('./config.json');
const request = require('request');
const path = require('path');
const _ = require('lodash');
const { LocalDate, ChronoUnit, nativeJs } = require('js-joda');
const moment = require("moment");
const DateUtils = require('./date-utils');
const dailiesService = require('./dailies-service');
const inventoryService = require('./inventory-service');
const DynalistService = require('./dynalist-service');

const createNewEntry = async (fileId, parentId, content, index = 0) => {
    return await DynalistService.updateDocument(fileId, [{
        "action": "insert",
        "parent_id": parentId,
        "index": index,
        "content": content
    }]);
}


const capitalizeFirstLetter = (s) => {
    if (typeof s !== 'string') return ''
    s = s.toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1)
}

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

const ensureCorrectYearEntry = async (journalId, journalDocument, monthEntryId, newDate) => {
    const yearEntry = journalDocument.nodes.find(node => node.children && node.children.includes(monthEntryId));
    var yearEntryId = yearEntry.id;
    const newDateYear = newDate.year() + "";
    if (newDateYear !== yearEntry.content) {
        //todo do it the stupid polling way and then update it to do it more efficiently in less api calls
        const yearParentEntryId = journalDocument.nodes.find(node => node.children && node.children.includes(yearEntry.id)).id;
        const yearUpdateResult = await DynalistService.updateDocument(journalId, [{
            "action": "insert",
            "parent_id": yearParentEntryId,
            "index": 0,
            "content": newDateYear
        }]);
        yearEntryId = yearUpdateResult.new_node_ids[0];
    }
    return yearEntryId;

}

const ensureCorrectMonthEntry = async (journalId, journalDocument, lastEntryId, newDate) => {
    const monthEntry = journalDocument.nodes.find(node => node.children && node.children.includes(lastEntryId));
    var monthEntryId = monthEntry.id;
    const yearEntryId = await ensureCorrectYearEntry(journalId, journalDocument, monthEntryId, newDate);
    const newDateMonthName = capitalizeFirstLetter(newDate.month().name());
    if (newDateMonthName !== monthEntry.content) {
        const monthUpdateResult = await DynalistService.updateDocument(journalId, 
            [{
                "action": "insert",
                "parent_id": yearEntryId,
                "index": 0,
                "content": newDateMonthName
            }]
        );
        monthEntryId = monthUpdateResult.new_node_ids[0];
    }
    return monthEntryId;
}


const updateOldEntry = async (fileId, id, content) => {
    await DynalistService.updateDocument(fileId, [{
        "action": "edit",
        "node_id": id,
        "content": content
    }]);
}

const todayTag = "#today-journal-entry";
const yesterdayTag = "#yesterday-journal-entry";
const todayTodoListTag = "#todo-today"

const padDateNumWithZeros = (numString) => numString.length === 1 ? ("0" + numString) : numString

const createJournalEntries = async () => {
    const journalId = config.journalDocumentId;
    var journalDocument = await DynalistService.getDocument(journalId);
    console.log(journalDocument);
    var lastEntry = journalDocument.nodes.find(node => node.content.includes(todayTag));
    var previousEntry = journalDocument.nodes.find(node => node.content.includes(yesterdayTag));
    if (lastEntry == null) {
        throw Error("there is no latest element");
    }
    if (previousEntry == null) {
        throw Error("there is no previous element");
    }
    //todo switch over from js-joda to momentjs (moment is more convenient)
    var newDate = LocalDate.from(nativeJs(DateUtils.getDateFromDynalistNote(lastEntry.content)));
    const today = LocalDate.now();
    const daysDifference = newDate.until(today, ChronoUnit.DAYS);
    var parentEntry = journalDocument.nodes.find(node => node.children && node.children.includes(lastEntry.id));
    if (parentEntry == null) {
        throw Error("latest element not found in journal tree");
    }
    for (var i = 0; i < daysDifference; i++) {
        newDate = newDate.plusDays(1);
        //todo don't pass in the journal document, just the month and year
        const monthEntryId = await ensureCorrectMonthEntry(journalId, journalDocument, lastEntry.id, newDate);
        const oldLastEntryContent = lastEntry.content.replace(todayTag, yesterdayTag);
        await updateOldEntry(journalId, lastEntry.id, oldLastEntryContent);
        const oldPreviousEntryContent = previousEntry.content.replace(" " + yesterdayTag, "");
        await updateOldEntry(journalId, previousEntry.id, oldPreviousEntryContent);
        const month = padDateNumWithZeros(newDate.month().value().toString());
        const day = padDateNumWithZeros(newDate.dayOfMonth().toString());
        const newEntryContent = `!(${newDate.year()}-${month}-${day}) ${todayTag}`
        await createNewEntry(journalId, monthEntryId, newEntryContent)
        journalDocument = await DynalistService.getDocument(journalId);
        lastEntry = journalDocument.nodes.find(node => node.content.includes(todayTag));
        previousEntry = journalDocument.nodes.find(node => node.content.includes(yesterdayTag));
    }
}

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
    const todayTodayLists = allNodes.filter(node => node.content.includes(todayTodoListTag));
    //journal entries
    const journalDocument = await DynalistService.getDocument(config.journalDocumentId);
    const journalNodes = journalDocument.nodes;
    const yesterdayJournalEntry = journalNodes.find(node => node.content.includes(yesterdayTag));
    for (var todayTodoList of todayTodayLists) { 
        const newNodeContent = generatePathToNodeString(todayTodoList, allNodes, todayTodoList.content);
        const newNodeResult = await createNewEntry(config.journalDocumentId, yesterdayJournalEntry.id, newNodeContent);
        const newNodeId = newNodeResult.new_node_ids[0];
        await archiveTodoList(todayTodoList, allNodes, newNodeId);
    }  
}
(async () => {
    await createJournalEntries();

    await archiveCompletedTodos();

    await runDynalistUpdates();

    await dailiesService.updateDailies();

    await inventoryService.updateInventory();
})();


