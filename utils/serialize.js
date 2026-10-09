// Keep the legacy _id field and numeric prices in API responses.
function serialize(record) {
    const result = { ...record, _id: record.id };
    if (record.price !== undefined) result.price = Number(record.price);
    return result;
}
module.exports = serialize;
