const datatypes = {
    string: "http://www.w3.org/2001/XMLSchema#string",
    integer: "http://www.w3.org/2001/XMLSchema#integer",
    decimal: "http://www.w3.org/2001/XMLSchema#decimal",
    langString: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"
};
const commonPrefixSource = "https://prefix.cc/popular/all.file.json";
const commonPrefixes = [];

class Triplestore {
    static initializeCommonPrefixes() {
        fetch(commonPrefixSource).then(response => {
            response.json().then(doc => {
                for(const prefix in doc)
                    commonPrefixes.push([prefix, doc[prefix]]);
            })
        });
    }

    constructor() {
        this.triples = [];
        this.prefixes = [];
        for(const prefix in commonPrefixes) {
            const name = (commonPrefixes[prefix])[0];
            const value = (commonPrefixes[prefix])[1];
            this.prefixes.push(new Prefix(name, new URI(value)));
        }
        this.uris = {};
        this.blankNodes = {};
        this.literals = [];
    }

    getURI(value) {
        let uri = this.uris[value];
        if(!uri) {
            uri = new URI(value);
            this.uris[value] = uri;
        }
        return uri;
    }

    getBlankNode(name) {
        let bn = this.blankNodes[name];
        if(!bn) {
            bn = new BlankNode(name);
            this.blankNodes[name] = bn;
        }
        return bn;
    }

    getLiteral(value, datatype, language=null) {
        const literal = new Literal(value, datatype, this, language);
        this.literals.push(literal);
        return literal;
    }

    addPrefix(name, value) {
        for(let i=0; i<this.prefixes.length; i++) {
            const prefix = this.prefixes[i];
            if (prefix.name === name)
                return prefix;
        }
        this.prefixes.push(new Prefix(name, new URI(value)));
    }

    addTriple(subject, predicate, object) {
        this.triples.push(new Triple(subject, predicate, object));
    }

    finalize() {
        for(const uri in this.uris)
            this.uris[uri].updatePrefix(this.prefixes);
        for(const literal in this.literals)
            this.literals[literal].updatePrefix(this.prefixes);
        this.removeUnusedPrefixes();
        this.triples = this.triples.sort((a, b) => {
            return a.compareTo(b);
        });
        this.prefixes = this.prefixes.sort((a, b) => {
            return a.compareTo(b);
        });
        for(const uri in this.uris)
            this.uris[uri].createHtml();
        for(const blankNode in this.blankNodes)
            this.blankNodes[blankNode].createHtml();
        for(const literal in this.literals)
            this.literals[literal].createHtml();
        for(const prefix in this.prefixes)
            this.prefixes[prefix].createHtml();
    }

    removeUnusedPrefixes() {
        const toRemove = [];
        for(const prefix in this.prefixes) {
            if(!this.prefixes[prefix].used)
                toRemove.push(prefix);
        }
        toRemove.reverse();
        for(const remove in toRemove)
            this.prefixes.splice(toRemove[remove], 1);
    }

    getTriplesWithSameFieldAs(index, field, indices=null, indicesIndex=0) {
        if(index < 0 || index >= this.triples.length ||
            (indices && (indicesIndex < 0 || indicesIndex >= indices.length)))
            return null;
        const value = this.triples[index][field];
        let cursor = value;
        const result = [];
        while(cursor === value) {
            result.push(index);
            indicesIndex++;
            if(indices && indicesIndex >= indices.length)
                break;
            index = indices ? indices[indicesIndex] : index+1;
            if(index >= this.triples.length)
                break;
            cursor = this.triples[index][field];
        }
        return result;
    }
}

class Triple {
    constructor(subject, predicate, object) {
        this.subject = subject;
        subject.addTriple(this);
        this.predicate = predicate;
        predicate.addTriple(this);
        this.object = object;
        object.addTriple(this);
    }

    compareTo(triple) {
        let comp = this.subject.compareTo(triple.subject, "subject");
        if(comp === 0)
            comp = this.predicate.compareTo(triple.predicate, "predicate");
        if(comp === 0)
            comp = this.object.compareTo(triple.object, "object");
        return comp;
    }
}

class Resource {
    constructor(value) {
        this.value = value;
        this.html = null;
        this.representationLength = 0;
        this.triples = [];
    }

    compareTo(resource, position=null) {
        if(["subject", "object"].includes(position))
            return this.compareTypes(this, resource);
        return Resource.compareValues(this.value, resource.value);
    }

    compareTypes(a, b) {
        const typeA = a.getTypeNumber();
        const typeB = b.getTypeNumber();
        if(typeA <= 0 || typeB <= 0 || typeA === typeB)
            return a.compareTo(b);
        else
            return (typeA < typeB) ? -1 : 1;
    }

    static compareValues(a, b) {
        const pattern = /[^[0-9][0-9]+$/;
        if(pattern.test(a) && pattern.test(b)) {
            const aLength = (a.match(pattern)[0]).length-1;
            const bLength = (b.match(pattern)[0]).length-1;
            const aString = a.substring(0, a.length-aLength);
            const bString = b.substring(0, b.length-bLength);
            if(aString === bString) {
                const aInt = parseInt(a.substring(aString.length));
                const bInt = parseInt(b.substring(bString.length));
                return aInt < bInt ? -1 : (aInt > bInt ? -1 : 0);
            }
        }
        return a.localeCompare(b);
    }

    getTypeNumber() {
        return 0;
    }

    addTriple(triple) {
        this.triples.push(triple);
    }
}

class URI extends Resource {
    constructor(value) {
        super(value);
        this.prefix = null;
    }

    updatePrefix(prefixes) {
        if(this.prefix !== null)
            return;
        for(let i=0; i<prefixes.length; i++) {
            const prefix = prefixes[i];
            const value = prefix.value.value;
            if(this.value.length > value.length && this.value.substr(0, value.length) === value) {
                this.prefix = prefix;
                prefix.used = true;
                return;
            }
        }
    }

    createHtml(retrieveHtml=false, forPrefix=false) {
        const html = document.createElement("span");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(this.value));
        if(!forPrefix && this.prefix !== null) {
            const prefixValue = this.prefix.value.value;
            const value = this.prefix.name + ":" + this.value.substr(prefixValue.length, this.value.length);
            link.appendChild(document.createTextNode(value));
            html.appendChild(link);
            if(this.html === null)
                this.representationLength = value.length;
        }
        else {
            link.appendChild(document.createTextNode(this.value));
            html.appendChild(document.createTextNode("<"));
            html.appendChild(link);
            html.appendChild(document.createTextNode(">"));
            if(forPrefix)
                return html;
            if(this.html === null)
                this.representationLength = this.value.length + 2;
        }
        if(this.html === null)
            this.html = html;
        if(retrieveHtml)
            return html;
    }

    getTypeNumber() {
        return 2;
    }
}

class BlankNode extends Resource {
    constructor(value) {
        super(value);
        this.representationLength = value.length + 2;
    }

    compareTo(resource, position=null) {
        if(["subject", "object"].includes(position))
            return this.compareTypes(this, resource);
        if((typeof resource === typeof this) && /b[0-9]+/.test(this.value) && /b[0-9]+/.test(resource.value)) {
            const myNumber = parseInt(this.value.substring(1, this.value.length));
            const otherNumber = parseInt(resource.value.substring(1, resource.value.length));
            return myNumber < otherNumber ? -1 : (myNumber > otherNumber ? 1 : 0);
        }
        return Resource.compareValues(this.value, resource.value);
    }

    createHtml() {
        const html = document.createElement("span");
        html.appendChild(document.createTextNode("_:" + this.value));
        this.html = html;
    }

    getTypeNumber() {
        return 3;
    }
}

class Literal extends Resource {
    constructor(value, datatype, triplestore, language=null) {
        super(value.replace(new RegExp("\"", 'g'), "\'"));
        this.dtype = triplestore.getURI(datatype);
        if(this.dtype.value !== datatypes.langString)
            language = null;
        this.language = language;
    }

    updatePrefix(prefixes) {
        this.dtype.updatePrefix(prefixes);
    }

    createHtml() {
        const html = document.createElement("span");
        let node;
        switch(this.dtype.value) {
            case datatypes.string:
                node = document.createTextNode("\"" + this.value + "\"");
                break;
            case datatypes.integer:
            case datatypes.decimal:
                node = document.createTextNode(this.value);
                break;
            case datatypes.langString:
                node = document.createTextNode("\"" + this.value + "\"@" + this.language);
                break;
            default:
                node = document.createTextNode("\"" + this.value + "\"^^");
                html.appendChild(node);
                const dtypeHtml = this.dtype.createHtml(true);
                const n = dtypeHtml.childNodes.length;
                for(let i=0; i<n; ++i)
                    html.appendChild(dtypeHtml.childNodes[0]);
                this.html = html;
                return;
        }
        html.appendChild(node);
        this.html = html;
    }

    getTypeNumber() {
        return 2;
    }
}

class Prefix extends Resource {
    constructor(name, value) {
        super(value);
        this.name = name;
        this.used = false;
    }

    createHtml() {
        const html = document.createElement("span");
        html.appendChild(document.createTextNode("@prefix " + this.name + ": "));
        html.appendChild(this.value.createHtml(true, true));
        html.appendChild(document.createTextNode(" ."));
        this.html = html;
    }

    compareTo(prefix) {
        return Resource.compareValues(this.name, prefix.name);
    }
}

function getTriplestore() {
    return new Triplestore();
}

module.exports = {getTriplestore};

Triplestore.initializeCommonPrefixes();
