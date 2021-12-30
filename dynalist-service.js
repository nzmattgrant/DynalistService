const config = require('./config.json');
const request = require('request');

const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const getPostResponse = async (url, json) => {
    await delay(1000);//rate limited on requests (one every second);

    return new Promise((resolve, reject) => {
        request.post(
            {
                url: url,
                json: json
            },
            (error, res, body) => {
                if (!error && res.statusCode == 200) {
                    resolve(body);
                } else {
                    reject(error);
                }
            }
        );
    });
}

const updateDocument = async (documentId, changes) => {
    return await getPostResponse('https://dynalist.io/api/v1/doc/edit',
        {
            token: config.dynalistApiKey,
            file_id: documentId,
            changes: changes
        });
}

const getDocument = async (id) => {
    const document = await getPostResponse('https://dynalist.io/api/v1/doc/read',
        {
            token: config.dynalistApiKey,
            file_id: id
        });
    return document;
}

const getSubTreesOrNull = (item, nodes, includeItemTest = _ => true) => {
    const subTrees = [];
    if (item.children) {
        const childrenItems = nodes.filter(node => item.children.includes(node.id))
        childrenItems.forEach(childItem => {
            const childAsSubtrees = getSubTreesOrNull(childItem, nodes);
            if (childAsSubtrees != null) {
                subTrees.push(childAsSubtrees)
            }
        });
    }
    if (includeItemTest(item) || subTrees.length) {
        return {
            id: item.id,
            content: item.content,
            checked: item.checked || false,
            children: subTrees
        };
    }
    return null;
}

const getCheckedItemsSubTreesOrNull = (item, nodes, ancestorChecked = false) => {
    const subTrees = [];
    const isItemChecked = item.checked || false;
    if (item.children) {
        const childrenItems = nodes.filter(node => item.children.includes(node.id))
        childrenItems.forEach(childItem => {
            const childAsSubtrees = getCheckedItemsSubTreesOrNull(childItem, nodes, isItemChecked || ancestorChecked);
            if (childAsSubtrees != null) {
                subTrees.push(childAsSubtrees)
            }
        });
    }
    if (isItemChecked || ancestorChecked || subTrees.length) {
        return {
            id: item.id,
            content: item.content,
            checked: isItemChecked,
            children: subTrees
        };
    }
    return null;
}

const deleteNodes = async (documentId, nodes) => {
    const toDeleteChanges = nodes.map(node => {
        return {
            "action": "delete",
            "node_id": node.id,
        }
    });
    await updateDocument(documentId, toDeleteChanges);
}

const getNodeByHashTag = (documentId, hashTag) => {
    const document = getDocument(documentId);
    const nodes = document.nodes;
    return nodes.find(node => node.content.includes(hashTag));
}

const copySubTrees = async (subTrees, parentId, documentId, includeChecked) => {
    if (!subTrees || !subTrees.length) {
        return [];
    }
    var copiedIds = [];
    var changes = [];
    subTrees.forEach((item, i) => {
        var change = {
            "action": "insert",
            "parent_id": parentId,
            "index": i,
            "content": item.content
        }
        if(includeChecked){
            change = { 
                ...change, 
                "checkbox": true,
                "checked": item.checked || false,
            };
        }
        changes.push(change);
        copiedIds.push(item.id);
        if(item.id === undefined){
            console.log(item);
        }
    });
    var result = await updateDocument(documentId, changes);
    var newIds = result.new_node_ids || [];
    //Assumption is that everything is in the same order as what they were passed in as
    //If not it's really annoying
    for (var i = 0; i < subTrees.length; i++) {
        const copiedChildIds = await copySubTrees(subTrees[i].children || [], newIds[i], documentId, includeChecked);
        copiedIds = copiedIds.concat(copiedChildIds);
    }
    return copiedIds;
}

const moveNodesToDifferentDocument = async (nodes, sourceDocumentId, destinationDocumentId, toMoveUnderNodeId = 'root', includeChecked = true) => {
    const insertChanges = [];
    const deleteChanges = [];
    var positionIndex = 0;
    console.log(destinationDocumentId);
    nodes.forEach(node => {
        let insertChange = {
            "action": "insert",
            "parent_id": toMoveUnderNodeId || 'root',
            "index": positionIndex,
            "content": node.content,
            "note": node.note,
            "heading": node.heading,
            "color": node.color
        }
        if(includeChecked){
            insertChange = { 
                ...insertChange, 
                "checkbox": true,
                "checked": node.checked || false,
            };
        }
        insertChanges.push(insertChange);
        const deleteChange = {
            "action": "delete",
            "node_id": node.id
        }
        deleteChanges.push(deleteChange);
        positionIndex = positionIndex + 1;
    });
    const insertResult = await updateDocument(destinationDocumentId, insertChanges);
    const deleteResult = await updateDocument(sourceDocumentId, deleteChanges);
    return [insertResult, deleteResult];
}

const moveNodes = async (nodes, sourceDocumentId, toMoveUnderNodeId, includeChecked = true) => {

    var changes = [];

    var positionIndex = 0;
    nodes.forEach(node => {

        var change = {
            "action": "move",
            "node_id": node.id,
            "parent_id": toMoveUnderNodeId,
            "index": positionIndex
        }
        if(includeChecked){
            change = { 
                ...change, 
                "checkbox": true,
                "checked": node.checked || false,
            };
        }
        changes.push(change);
        positionIndex = positionIndex + 1;
    });
    console.log(changes);

    await updateDocument(sourceDocumentId, changes);
}

const moveNodeIds = async (nodeIds, parentId, documentId) => {
    var changes = [];

    var positionIndex = 0;
    _.forEach(nodeIds, nodeId => {
        console.log(nodeId);
        changes.push({
            "action": "move",
            "node_id": nodeId,
            "parent_id": parentId,
            "index": positionIndex
        });
        positionIndex = positionIndex + 1;
    });

    await updateDocument(documentId, changes);
}

const uncheckNodes = async (nodes, documentId) => {
    const changes = [];
    nodes.forEach(node => {
        changes.push({
            "action": "edit",
            "node_id": node.id,
            "checked": false,
        });
    });
    await updateDocument(documentId, changes);
}

const createNewEntry = async (fileId, parentId, content, index = 0) => {
    return await DynalistService.updateDocument(fileId, [{
        "action": "insert",
        "parent_id": parentId,
        "index": index,
        "content": content
    }]);
}

const filterNodesByContent = (document, filterString) => {
    return document.nodes.filter(n => n.content.includes(filterString));
}

const DynalistService = {
    getDocument,
    updateDocument,
    deleteNodes,
    getSubTreesOrNull,
    getCheckedItemsSubTreesOrNull,
    getNodeByHashTag,
    copySubTrees,
    moveNodes,
    moveNodesToDifferentDocument,
    uncheckNodes,
    createNewEntry,
    filterNodesByContent
}

module.exports = DynalistService;