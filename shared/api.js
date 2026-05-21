// API layer - Supabase backed with localStorage mock mode

function createApi(listName) {
    var isMock = !CONFIG.SUPABASE_URL;
    var storageKey = 'listlet_' + CONFIG.DB_TABLE + '_' + listName;

    return {
        isMock: isMock,
        listName: listName,

        /**
         * Fetch all items for this list
         * @returns {Promise<Array>}
         */
        async fetchItems() {
            if (isMock) {
                var saved = localStorage.getItem(storageKey);
                return saved ? JSON.parse(saved) : [];
            }

            var result = await window.supabaseClient
                .from(CONFIG.DB_TABLE)
                .select('*')
                .eq('list_name', listName)
                .order('created_at');

            if (result.error) throw new Error(result.error.message);
            return result.data || [];
        },

        /**
         * Create a new item
         * @param {Object} fields - { content }
         * @returns {Promise<Object>} The created item
         */
        async createItem(fields) {
            if (isMock) {
                var items = JSON.parse(localStorage.getItem(storageKey) || '[]');
                var now = new Date().toISOString();
                var item = {
                    id: crypto.randomUUID(),
                    list_name: listName,
                    content: fields.content || '',
                    created_at: now,
                    updated_at: now
                };
                items.push(item);
                localStorage.setItem(storageKey, JSON.stringify(items));
                return item;
            }

            var result = await window.supabaseClient
                .from(CONFIG.DB_TABLE)
                .insert({ list_name: listName, content: fields.content || '' })
                .select()
                .single();

            if (result.error) throw new Error(result.error.message);
            return result.data;
        },

        /**
         * Update an existing item
         * @param {string} id - Item UUID
         * @param {Object} changes - { content }
         * @returns {Promise<Object>} The updated item
         */
        async updateItem(id, changes) {
            if (isMock) {
                var items = JSON.parse(localStorage.getItem(storageKey) || '[]');
                var item = null;
                for (var i = 0; i < items.length; i++) {
                    if (items[i].id === id) {
                        if (changes.content !== undefined) items[i].content = changes.content;
                        items[i].updated_at = new Date().toISOString();
                        item = items[i];
                        break;
                    }
                }
                localStorage.setItem(storageKey, JSON.stringify(items));
                return item;
            }

            var result = await window.supabaseClient
                .from(CONFIG.DB_TABLE)
                .update({ content: changes.content })
                .eq('id', id)
                .select()
                .single();

            if (result.error) throw new Error(result.error.message);
            return result.data;
        },

        /**
         * Delete an item
         * @param {string} id - Item UUID
         * @returns {Promise<void>}
         */
        async deleteItem(id) {
            if (isMock) {
                var items = JSON.parse(localStorage.getItem(storageKey) || '[]');
                items = items.filter(function(item) { return item.id !== id; });
                localStorage.setItem(storageKey, JSON.stringify(items));
                return;
            }

            var result = await window.supabaseClient
                .from(CONFIG.DB_TABLE)
                .delete()
                .eq('id', id);

            if (result.error) throw new Error(result.error.message);
        }
    };
}

/**
 * Get all lists with counts
 * @returns {Promise<Array>} [{list_name, count, updated_at}]
 */
createApi.getAllLists = async function() {
    var isMock = !CONFIG.SUPABASE_URL;

    if (isMock) {
        var prefix = 'listlet_' + CONFIG.DB_TABLE + '_';
        var lists = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf(prefix) === 0) {
                var listName = key.substring(prefix.length);
                var items = JSON.parse(localStorage.getItem(key));
                var maxUpdated = null;
                for (var j = 0; j < items.length; j++) {
                    if (!maxUpdated || items[j].updated_at > maxUpdated) {
                        maxUpdated = items[j].updated_at;
                    }
                }
                lists.push({ list_name: listName, count: items.length, updated_at: maxUpdated });
            }
        }
        return lists;
    }

    var result = await window.supabaseClient
        .from(CONFIG.DB_TABLE)
        .select('list_name, updated_at')
        .order('updated_at', { ascending: false });

    if (result.error) throw new Error(result.error.message);

    // Group by list_name
    var groups = {};
    var rows = result.data || [];
    for (var k = 0; k < rows.length; k++) {
        var row = rows[k];
        if (!groups[row.list_name]) {
            groups[row.list_name] = { list_name: row.list_name, count: 0, updated_at: row.updated_at };
        }
        groups[row.list_name].count++;
        if (row.updated_at > groups[row.list_name].updated_at) {
            groups[row.list_name].updated_at = row.updated_at;
        }
    }

    var listArr = [];
    for (var name in groups) {
        listArr.push(groups[name]);
    }
    listArr.sort(function(a, b) {
        return (b.updated_at || '') > (a.updated_at || '') ? 1 : -1;
    });
    return listArr;
};
