import DynalistService = require('./dynalist-service')
import * as config from './config.json';
import axios from 'axios';

const invoke = async (action, version, params={}) => {
    const stringVer = JSON.stringify({action, version, params});
    return await axios.post('http://127.0.0.1:8765', stringVer);
}

const createFlashcards = async (nodes) => {
    console.log(nodes);
    for(const node of nodes){
        const splitContent = (node.content ?? '').replace(config.flashcardsTag, '')
        .replace('=>', '->').split('->');
        if(node.checked || splitContent.length < 2){
            continue;
        }
        const params = {
            "note": {
                "deckName": "Life Lessons",
                "modelName": "Basic",
                "fields": {
                    "Front": splitContent[0],
                    "Back": splitContent[1]
                },
                "options": {
                    "allowDuplicate": true
                },
                "tags": [
                    "dynalist"
                ],
            }
        };
        try{
            await invoke("addNote", 6, params);
        }
        catch (error) {
            console.error(error);
        }
    }
}

const checkOffConvertedFlashCards = async (nodes) => {
    const changes = nodes.map(n => {
        return {
            "action": "edit",
            "node_id": n.id,
            "checkbox": true,
            "checked": true
        };
    });
    await DynalistService.updateDocument(config.dynalistFlashcardsDocumentId, changes);
}

export const updateFlashcardNotes = async () => {
    const todoToday = await DynalistService.getDocument(config.dynalistTodoListDocumentId);//todo get subtree
    const filteredItems = DynalistService.filterNodesByContent(todoToday, config.flashcardsTag);
    await DynalistService.moveNodesToDifferentDocument(filteredItems, config.dynalistTodoListDocumentId, config.dynalistFlashcardsDocumentId);
    const flashcardDocument = await DynalistService.getDocument(config.dynalistFlashcardsDocumentId);
    const flashcardNodes = flashcardDocument.nodes.filter(n => !n.checked);
    const result = await createFlashcards(flashcardNodes);
    await checkOffConvertedFlashCards(flashcardNodes);
}